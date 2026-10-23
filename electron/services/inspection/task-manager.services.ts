import * as api from './api.services.js'
import type { Inspection, TaskParams, UpdateTaskParams, InspectionDetailParams, GoodsDetailParams } from './type.js'
import type { PageParams } from '../../types/index.js'
import { InspectionServices } from './index.services.js'
import { inspectionDependencies } from './inspection-runtime.services.js'
import type { BrowserWindow } from 'electron'
import { CronServices } from '../common/cron.services.js'
import { TaskScope } from '../common/task-scope.services.js'
import log from '../../log/index.js'

interface ManagerDependencies {
  api: typeof api
  createTask(task: Inspection, window: BrowserWindow | null): InspectionServices
  cron: Pick<CronServices, 'register' | 'delete'>
}

export class TaskManager {
  private static instance: TaskManager
  private readonly tasks = new Map<string, InspectionServices>()
  private readonly executions = new Map<string, Promise<void>>()
  private readonly results = new Map<string, Inspection>()
  private readonly cronIds = new Set<string>()
  private queue: string[] = []
  private mainWindow: BrowserWindow | null = null
  private concurrency = 4
  private stopping = false
  private generation = 0
  private stopPromise?: Promise<void>
  constructor(private readonly deps: ManagerDependencies = {
    api, createTask: (task, window) => new InspectionServices(task, window, inspectionDependencies), cron: CronServices.getInstance(),
  }) {}

  static getInstance() { return this.instance ??= new TaskManager() }
  setMainWindow(window: BrowserWindow) { this.mainWindow = window }
  setConcurrency(concurrency: number) {
    if (!Number.isInteger(concurrency) || concurrency < 1) throw new Error('巡查并发数必须为正整数')
    this.concurrency = concurrency
    this.pump()
  }
  getConcurrency() { return this.concurrency }

  async getTaskList(params: PageParams) {
    const response = await this.deps.api.getTaskListAPI(params)
    if (response.code === 0) response.data.list = response.data.list.map(task => ({ ...task, ...(this.getTask(task._id) ?? this.results.get(task._id)) }))
    return response
  }
  async getRunningTaskList() { return { code: 0, data: [...this.tasks.keys()].map(id => this.getTask(id)!), message: '获取成功' } }
  getCronTaskList() { return this.deps.api.getTimerTaskListAPI() }
  getTask(taskId: string): Inspection | null {
    const info = this.tasks.get(taskId)?.getTaskInfo()
    if (!info) return null
    if (this.executions.has(taskId) && ['completed', 'failed', 'cancelled'].includes(info.status))
      return { ...info, phase: info.status === 'cancelled' ? 'stopping' : 'cleaning' }
    return info
  }
  async createTask(params: TaskParams) {
    const generation = this.generation
    const response = await this.deps.api.createTaskAPI(params)
    if (response.code === 0 && generation === this.generation) this.schedule(response.data)
    return response
  }
  async updateTask(params: UpdateTaskParams) {
    const generation = this.generation
    if (this.tasks.has(params.taskId)) throw new Error('任务正在运行、排队或回收中')
    const response = await this.deps.api.updateTaskAPI(params)
    if (response.code === 0 && generation === this.generation) { this.results.delete(params.taskId); this.schedule(response.data) }
    return response
  }
  async deleteTask(params: { taskIds: string[] }) {
    for (const id of params.taskIds) {
      const task = this.getTask(id)
      if (task) await this.stopTask(task)
    }
    const response = await this.deps.api.deleteTaskAPI(params)
    if (response.code === 0) for (const id of params.taskIds) {
      this.deps.cron.delete(id)
      this.cronIds.delete(id)
      this.results.delete(id)
    }
    return response
  }
  private schedule(task: Inspection) {
    if (this.stopping) return
    if (task.executionMethod !== 'AUTO') { this.deps.cron.delete(task._id); this.cronIds.delete(task._id); return }
    const match = String(task.autoExecutionTime).match(/^(\d{1,2}):(\d{2})$/)
    if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) throw new Error('巡查定时时间格式应为 HH:mm')
    const generation = this.generation
    this.deps.cron.register({ name: task._id, expression: `${Number(match[2])} ${Number(match[1])} * * *`, handler: async () => {
      try { if (generation === this.generation) await this.executeTask(task) }
      catch (error) { log.error('定时巡查启动失败:', error) }
    } })
    this.cronIds.add(task._id)
  }
  async restoreScheduledTasks() {
    const generation = this.generation
    const response = await this.getCronTaskList()
    if (response.code !== 0 || this.stopping || generation !== this.generation) return
    for (const task of response.data) {
      try { this.schedule(task) } catch (error) { log.error('恢复巡查定时任务失败:', error) }
    }
  }

  /** 先登记再调度，重复点击或定时触发不能绕过本地去重。满额进入等待队列。 */
  async executeTask(info: Inspection) {
    if (this.stopping) throw new Error('巡查管理器正在停止')
    if (this.tasks.has(info._id)) return false
    const task = this.deps.createTask({ ...info }, this.mainWindow)
    this.tasks.set(info._id, task)
    this.results.delete(info._id)
    task.markPending()
    this.queue.push(info._id)
    this.notify(info._id)
    this.pump()
    return true
  }
  private pump() {
    while (!this.stopping && this.executions.size < this.concurrency && this.queue.length) {
      const id = this.queue.shift()!
      const task = this.tasks.get(id)
      if (!task) continue
      const execution = Promise.resolve().then(async () => {
        const running = task.start()
        this.notify(id)
        await running
      }).catch(error => log.warn('巡查执行结束:', error)).finally(async () => {
        try { await task.stopTask() }
        catch (error) { log.error('巡查兜底清理失败:', error) }
        finally {
          const info = task.getTaskInfo()
          this.executions.delete(id)
          this.tasks.delete(id)
          this.remember(info)
          this.notify(id, info)
          this.pump()
        }
      })
      this.executions.set(id, execution)
    }
  }
  async stopTask(info: Inspection): Promise<Inspection> {
    const task = this.tasks.get(info._id)
    this.queue = this.queue.filter(id => id !== info._id)
    let final: Inspection
    if (task) {
      await task.stopTask()
      await this.executions.get(info._id)
      final = task.getTaskInfo()
      this.tasks.delete(info._id)
    } else {
      const scope = new TaskScope()
      try {
        const response = await scope.run(signal => this.deps.api.updateTaskStatusAPI({ taskId: info._id, status: 'cancelled' }, signal), 5000, '取消未运行巡查')
        if (response.code !== 0) throw new Error(response.message)
      } finally { scope.stop() }
      final = { ...info, status: 'cancelled', phase: 'cancelled' }
    }
    this.remember(final)
    this.notify(info._id, final)
    this.pump()
    return final
  }
  stopAllTasks(): Promise<void> {
    if (this.stopPromise) return this.stopPromise
    this.stopping = true
    this.generation++
    this.queue = []
    this.stopPromise = (async () => {
      try {
        for (const id of this.cronIds) {
          try { this.deps.cron.delete(id) } catch (error) { log.error('停止巡查定时器失败:', error) }
        }
        this.cronIds.clear()
        await Promise.allSettled([...this.tasks.values()].map(task => task.stopTask()))
        await Promise.allSettled([...this.executions.values()])
        for (const [id, task] of this.tasks) this.notify(id, task.getTaskInfo())
      } finally {
        this.tasks.clear(); this.executions.clear(); this.results.clear()
        this.stopping = false; this.stopPromise = undefined
      }
    })()
    return this.stopPromise
  }
  private remember(info: Inspection) {
    this.results.delete(info._id); this.results.set(info._id, info)
    while (this.results.size > 200) this.results.delete(this.results.keys().next().value!)
  }
  private notify(id: string, fallback?: Inspection) {
    try {
      const task = this.getTask(id) ?? fallback
      if (task && this.mainWindow && !this.mainWindow.isDestroyed())
        this.mainWindow.webContents.send('inspection-task-status-update', { task, status: task.status })
    } catch (error) { log.warn('通知巡查状态失败:', error) }
  }
  getGoodsList(params: InspectionDetailParams) { return this.deps.api.getInspectionDetailAPI(params) }
  getGoodsDetail(params: GoodsDetailParams) { return this.deps.api.getGoodsDetailAPI(params) }
  getShopList(params: PageParams) { return this.deps.api.getShopListAPI(params) }
  getTodayBalance() { return this.deps.api.getTodayBalanceAPI() }
}
