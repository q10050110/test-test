import type { BrowserWindow } from 'electron'
import { Collection, CollectionRunError } from './collection.services.js'
import { collectionDependencies } from './collection-runtime.services.js'
import { CollectionResultStore } from './collection-result-store.services.js'
import type { CollectionResult, CollectionResultSummary } from './type.js'
import { createHash } from 'node:crypto'
import { TaskScope } from '../common/task-scope.services.js'
import log from '../../log/index.js'
import request from '../../utils/request.js'
import { Task } from './type.js'
import { SysTemUtils } from '../../utils/system.js'
import { autoUpGoods } from './interface.services.js'
import { operationStore } from '../../store/index.js'
import { join } from 'path'
const excelDir = join(SysTemUtils.getAppInfo().userDataPath, 'excel')
export class TaskManager {
  private static instance: TaskManager
  private tasks: Map<string, Collection> = new Map()
  private activeTasks: Set<string> = new Set()
  private executions = new Map<string, Promise<void>>()
  private stopping = false
  private stopPromise?: Promise<void>
  private maxConcurrentTasks
  private taskQueue: string[] = []
  private mainWindow: BrowserWindow | null = null
  private filePathList = new Map<string, CollectionResultSummary>()
  private get resultStore() {
    const userId = String(operationStore.get('user')?._id || 'anonymous')
    const owner = createHash('sha256').update(userId).digest('hex')
    return new CollectionResultStore(
      join(SysTemUtils.getAppInfo().userDataPath, 'collection-results', owner),
    )
  }
  private constructor() {
    this.maxConcurrentTasks = 4
  }

  public static getInstance(): TaskManager {
    if (!TaskManager.instance) {
      TaskManager.instance = new TaskManager()
    }
    return TaskManager.instance
  }

  setMainWindow(window: BrowserWindow) {
    this.mainWindow = window
  }
  /**
   * 获取当前并发任务数
   */
  getConcurrentTaskCount() {
    return this.maxConcurrentTasks
  }
  /**
   * 设置最大并发任务数
   */
  setMaxConcurrentTasks(max: number) {
    if (!Number.isInteger(max) || max < 1) throw new Error('并发任务数必须为正整数')
    this.maxConcurrentTasks = max
    while (this.activeTasks.size < this.maxConcurrentTasks && this.taskQueue.length)
      this.processNextTask()
  }
  /**
   * 添加任务（仅创建任务，不立即执行）
   */
  addTask(taskData: Task): Promise<string> {
    return new Promise(async (resolve, reject) => {
      let collection: Collection | null = null
      if (
        this.stopping ||
        (taskData._id &&
          (this.activeTasks.has(taskData._id) || this.taskQueue.includes(taskData._id)))
      ) {
        reject(new Error('任务仍在运行或回收中，请稍后再修改'))
        return
      }

      if (taskData._id) {
        try {
          const response = await request({
            url: '/api/auto/autoTask/editTask',
            method: 'post',
            data: {
              ...taskData,
              taskId: taskData._id,
            },
          })
          await this.tasks.get(taskData._id)?.clearStatus()
          collection = new Collection(
            { ...response.data, _id: response.data.taskId },
            this.mainWindow!,
            collectionDependencies,
          )
          this.tasks.set(collection.getTaskInfo()._id, collection)
        } catch (error) {
          log.error('更新任务数据失败', error)
          reject(error)
          return
        }
      } else {
        // 新任务，需要生成ID并补充信息
        try {
          const response = await request({
            url: '/api/auto/autoTask/createTask',
            method: 'post',
            data: taskData,
          })

          collection = new Collection(
            { ...response.data, _id: response.data.taskId },
            this.mainWindow!,
            collectionDependencies,
          )
          this.tasks.set(collection.getTaskInfo()._id, collection)
        } catch (error) {
          reject(error)
          return
        }
      }

      if (!collection) {
        reject('创建任务时，Collection 未正确初始化')
        return
      }

      const taskInfo = collection.getTaskInfo()
      resolve(taskInfo._id)
    })
  }

  /**
   * 复制任务
   */
  copyTask(taskData: Task): Promise<string> {
    return new Promise(async (resolve, reject) => {
      try {
        const response = await request({
          url: '/api/auto/autoTask/copyTask',
          method: 'post',
          data: {
            taskId: taskData._id,
          },
        })
        const newTaskData = { ...taskData, _id: response.data }
        const collection = new Collection(newTaskData, this.mainWindow!, collectionDependencies)
        this.tasks.set(newTaskData._id, collection)
        const taskInfo = collection.getTaskInfo()
        resolve(taskInfo._id)
      } catch (error) {
        reject(error)
        return
      }
    })
  }
  /**
   * 开始执行任务
   */
  async startTaskById(taskId: string): Promise<boolean> {
    if (this.stopping) throw new Error('任务管理器正在停止')
    const task = this.tasks.get(taskId)
    if (!task) throw new Error('任务不存在')
    if (this.activeTasks.has(taskId) || this.executions.has(taskId))
      throw new Error('任务正在运行或回收中')
    if (this.taskQueue.includes(taskId)) return true
    if (this.activeTasks.size < this.maxConcurrentTasks) void this.executeTask(taskId)
    else {
      this.taskQueue.push(taskId)
      await task.updateStatus('pending')
      this.notifyTaskUpdate(taskId, 'pending')
    }
    return true
  }

  /**
   * 实际执行任务
   */
  private executeTask(taskId: string): Promise<void> {
    const existing = this.executions.get(taskId)
    if (existing) return existing
    const task = this.tasks.get(taskId)
    if (!task || this.stopping) return Promise.resolve()
    this.activeTasks.add(taskId)
    this.notifyTaskUpdate(taskId, 'running')
    const store = this.resultStore
    const execution = (async () => {
      let result: CollectionResult | undefined
      try {
        result = await task.run()
      } catch (error) {
        if (error instanceof CollectionRunError) result = error.result
        else log.error('采集任务异常退出:', error)
      } finally {
        try {
          if (result) {
            const scope = new TaskScope()
            let summary: CollectionResultSummary
            try {
              summary = await scope.run(
                (signal) => store.save(taskId, result!, signal),
                30_000,
                '保存任务结果',
              )
            } finally {
              scope.stop()
            }
            this.filePathList.delete(taskId)
            this.filePathList.set(taskId, summary)
            // 商品数据在磁盘，摘要缓存也设上限。
            while (this.filePathList.size > 200)
              this.filePathList.delete(this.filePathList.keys().next().value!)
          }
        } catch (error) {
          log.error('保存任务结果失败:', error)
        } finally {
          try {
            await task.clearStatus()
          } catch (error) {
            log.error('清理任务失败:', error)
          }
          this.activeTasks.delete(taskId)
          this.executions.delete(taskId)
          const status = task.getTaskInfo().taskStatus
          try {
            this.notifyTaskUpdate(taskId, status)
            if (status === 'completed' && this.mainWindow && !this.mainWindow.isDestroyed()) {
              this.mainWindow.webContents.send('task-completed', {
                message: '任务：' + task.getTaskInfo().taskName + '已完成',
              })
            }
          } finally {
            this.tasks.delete(taskId)
            if (!this.stopping) this.processNextTask()
          }
        }
      }
    })().catch((error) => log.error('任务回收失败:', error))
    this.executions.set(taskId, execution)
    return execution
  }

  /**
   * 处理下一个待执行任务
   */
  private async processNextTask() {
    if (this.stopping) return
    if (this.taskQueue.length > 0 && this.activeTasks.size < this.maxConcurrentTasks) {
      const nextTaskId = this.taskQueue.shift()
      if (nextTaskId) {
        this.executeTask(nextTaskId)
      }
    }
  }

  /**
   * 获取任务信息
   */
  getTask(taskId: string) {
    const task = this.tasks.get(taskId)
    if (!task) return null
    const snapshot = task.getTaskInfo()
    // 状态同步或结果落盘仍在进行时，操作入口继续保持锁定。
    if (this.activeTasks.has(taskId) || this.executions.has(taskId)) {
      if (['completed', 'failed', 'cancelled'].includes(snapshot.taskStatus)) {
        return {
          ...snapshot,
          phase:
            snapshot.taskStatus === 'cancelled' ? ('stopping' as const) : ('cleaning' as const),
        }
      }
    }
    return snapshot
  }

  /**
   * 获取活跃任务
   */
  getActiveTasks() {
    return Array.from(this.activeTasks.values())
      .map((task) => this.getTask(task))
      .filter(Boolean)
  }
  /**
   * 获取任务列表（包括状态）
   */
  getAllTasksList() {
    const taskList: Task[] = []
    for (const [_, collection] of this.tasks) {
      taskList.push(this.getTask(collection.getTaskInfo()._id)!)
    }
    return taskList
  }

  /**
   * 分页获取所有任务
   */
  async getAllTasks(params: { pageNo: number; pageSize: number }): Promise<any> {
    try {
      const { data } = await request({
        url: '/api/auto/autoTask/getTaskList',
        method: 'post',
        data: params,
      })

      for (let task of data.list) {
        let copyTask = this.filePathList.get(task._id) || (await this.resultStore.summary(task._id))
        copyTask = this.filePathList.get(task._id) || copyTask
        const live = this.getTask(task._id)
        if (live) {
          Object.assign(task, live)
          continue
        }
        if (copyTask?.status) task.taskStatus = copyTask.status
        task.phase = ['noExecuted', 'pending'].includes(task.taskStatus) ? 'idle' : task.taskStatus
        task.progress =
          task.taskStatus !== 'pending'
            ? copyTask?.progress || { current: 0, total: 0, totalCount: 0 }
            : { current: 0, total: 0, totalCount: 0 }
        task.tableFilePath = copyTask?.filePath
        task.autoResult = copyTask?.autoResult
        task.hasUpLimit = copyTask?.hasUpLimit
        if (!task.tableFilePath) {
          const tableName = `${task.taskName}_${task._id}.xlsx`
          const filePath = join(excelDir, tableName)
          if (SysTemUtils.fileOperations.exists(filePath)) task.tableFilePath = filePath
        }
      }
      return data
    } catch (error) {
      log.error('获取任务列表失败', error)
      throw error
    }
  }

  /**
   * 取消任务
   */
  cancelTask(taskId: string): Promise<Task> {
    return new Promise(async (resolve, reject) => {
      const task = this.tasks.get(taskId)
      if (!task) {
        reject('任务不存在')
        return
      }

      try {
        // 从任务队列中移除
        const queueIndex = this.taskQueue.indexOf(taskId)
        if (queueIndex > -1) {
          this.taskQueue.splice(queueIndex, 1)
        }

        // 如果任务在执行中，调用取消方法
        if (this.activeTasks.has(taskId)) {
          await task.cancel()
          await this.executions.get(taskId)
        } else {
          // 如果任务不在执行中，直接更新状态
          await task.cancel()
          task.outputLog('取消任务')
          this.tasks.delete(taskId)
        }

        // 通知状态更新
        this.notifyTaskUpdate(taskId, task.getTaskInfo().taskStatus, task.getTaskInfo())

        // 处理队列中的下一个任务
        this.processNextTask()

        resolve(task.getTaskInfo())
      } catch (error) {
        log.error('取消任务失败', error)
        reject(error)
      }
    })
  }

  /**
   * 重新执行已完成或失败的任务
   */
  async reExecuteTask(taskId: string): Promise<boolean> {
    if (this.stopping || this.activeTasks.has(taskId) || this.executions.has(taskId))
      throw new Error('任务正在运行或回收中')
    let current = this.tasks.get(taskId)
    const info: Task =
      current?.getTaskInfo() ||
      (
        await request({
          url: '/api/auto/autoTask/getTaskById',
          method: 'post',
          data: { taskId },
        })
      ).data
    if (!info || !['completed', 'failed', 'cancelled'].includes(info.taskStatus))
      throw new Error('当前任务状态不允许重新执行')
    // 重新执行必须使用新的状态机和取消作用域。
    if (!current || current.getPhase() !== 'idle') {
      await current?.clearStatus()
      current = new Collection({ ...info, _id: taskId }, this.mainWindow!, collectionDependencies)
      this.tasks.set(taskId, current)
    }
    this.filePathList.delete(taskId)
    return this.startTaskById(taskId)
  }

  /**
   * 删除任务
   */
  async deleteTask(taskId: string | string[]): Promise<boolean> {
    const taskIds = Array.isArray(taskId) ? taskId : [taskId]
    let successCount = 0

    for (const id of taskIds) {
      const task = this.tasks.get(id)
      const task2 = this.filePathList.get(id)

      try {
        // 从服务器删除
        await request({
          url: '/api/auto/autoTask/deleteTask', // 或者使用批量删除接口
          method: 'post',
          data: { taskId: id },
        })

        if (task) await this.cancelTask(id)
        this.filePathList.delete(id)
        await this.resultStore.remove(id)

        successCount++

        try {
          const filePath = (await task?.getTableFilePath()) || task2?.filePath
          await SysTemUtils.fileOperations.deleteFile(filePath!)
        } catch (error) {
          log.error('删除任务文件失败', error)
        }
      } catch (error) {
        log.error(`删除任务 ${id} 失败`, error)
      }
    }

    // 如果是批量删除，检查是否有部分成功
    if (Array.isArray(taskId)) {
      return successCount > 0
    } else {
      return successCount === 1
    }
  }

  /**
   * 通知任务状态更新
   */
  private notifyTaskUpdate(taskId: string, status: string, fallback?: Task) {
    try {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        const task = this.getTask(taskId) || fallback
        if (task) {
          this.mainWindow.webContents.send('task-status-update', { task, status })
        }
      }
    } catch (error) {
      log.warn('通知任务状态失败:', error)
    }
  }

  /**
   * 批量删除任务
   */
  async deleteMultipleTasks(taskIds: string[]): Promise<boolean> {
    try {
      await request({
        url: '/api/auto/autoTask/deleteBatchTask',
        method: 'post',
        data: {
          taskIds: taskIds,
        },
      })

      for (const id of taskIds) {
        const task = this.tasks.get(id)
        const task2 = this.filePathList.get(id)
        if (task) await this.cancelTask(id)
        this.filePathList.delete(id)
        await this.resultStore.remove(id)
        if (!task && !task2) continue

        try {
          const filePath = (await task?.getTableFilePath()) || task2?.filePath
          await SysTemUtils.fileOperations.deleteFile(filePath!)
        } catch (error) {
          log.error('删除任务文件失败', error)
        }
      }

      return true
    } catch (error) {
      log.error('批量删除任务失败', error)
      throw error
    }
  }

  // 下载表格
  async downloadExcel(filePath: string) {
    if (!filePath) return new Error('文件不存在！')
    try {
      SysTemUtils.fileOperations.copyFile(filePath)
    } catch (error) {
      log.error('下载表格失败', error)
    }
  }

  // 刷新队列
  refreshTaskQueue() {
    // 并发名额仅在 executeTask 的 finally 中释放，状态变化不等于资源已回收。
    this.processNextTask()
  }

  /**
   * 终止所有任务（切换登录时调用）
   */
  stopAllTasks(): Promise<void> {
    if (this.stopPromise) return this.stopPromise
    this.stopping = true
    this.taskQueue = []
    this.stopPromise = (async () => {
      try {
        await Promise.allSettled([...this.tasks.values()].map((task) => task.cancel()))
        await Promise.allSettled([...this.executions.values()])
        await request({ url: '/api/auto/autoTask/resetStatus', method: 'post', data: {} })
      } catch (error) {
        log.error('重置任务状态失败:', error)
      } finally {
        this.tasks.clear()
        this.activeTasks.clear()
        this.executions.clear()
        this.filePathList.clear()
        this.stopping = false
        this.stopPromise = undefined
      }
    })()
    return this.stopPromise
  }

  async upGoods(task: Task) {
    const result = this.filePathList.get(task._id) || (await this.resultStore.summary(task._id))
    if (!result) throw new Error('任务不存在')
    const data = new Map()
    const goods = await this.resultStore.goods(task._id)
    goods.forEach((item: any) => data.set(item.id, item))
    return autoUpGoods(task, data)
  }
}
