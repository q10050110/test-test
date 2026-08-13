
import { createTaskAPI, getTaskListAPI, updateTaskAPI, deleteTaskAPI, getInspectionDetailAPI, getGoodsDetailAPI, getShopListAPI, getTimerTaskListAPI } from "./api.js"
import { InspectionList, TaskParams, UpdateTaskParams, Inspection, InspectionDetailParams, InspectionDetailList, GoodsDetailParams, GoodsDetail, ShopList } from './type'
import { InterfaceResult, PageParams } from '../../types/index'
import PQueue from 'p-queue'
import { InspectionServices } from './index.services.js'
import { BrowserWindow } from 'electron'
import { CronServices } from '../cron.services.js'
export class TaskManager {
  private static instance: TaskManager
  private queue: PQueue
  private runningTasks = new Map<string, any>()
  private mainWindow: BrowserWindow | null = null
  constructor() {
    this.queue = new PQueue({ concurrency: 4 })
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

  // 获取任务列表
  getTaskList(params: PageParams): Promise<InterfaceResult<InspectionList>> {
    return new Promise(async (resolve, reject) => {
      try {
        const { data, code, message } = await getTaskListAPI(params)
        resolve({
          code,
          data,
          message
        })
      } catch (error) {
        reject({ code: 500, data: null, message: error })
      }
    })
  }
  // 获取执行任务列表
  getRunningTaskList(): Promise<InterfaceResult<Inspection[]>> {
    return new Promise(async (resolve, reject) => {
      resolve({
        code: 0,
        data: [...this.runningTasks.values()].map(item => item.getTaskInfo()),
        message: '获取成功'
      })
    })
  }
  // 获取定时任务列表
  getCronTaskList(): Promise<InterfaceResult<Inspection[]>> {
    return new Promise(async (resolve, reject) => {
      try {
        const { data, code, message } = await getTimerTaskListAPI()
        resolve({
          code,
          data,
          message
        })
      } catch (error) {
        reject({ code: 500, data: null, message: error })
      }
    })
  }

  // 创建任务
  createTask(params: TaskParams): Promise<InterfaceResult<Inspection>> {
    return new Promise(async (resolve, reject) => {
      try {
        const { data, code, message } = await createTaskAPI(params)
        if (!code) {
          const cronServices = CronServices.getInstance()
          if (data.executionMethod === 'AUTO') {
            const now = new Date()
            const nextMinute = new Date(
              now.getTime() + 60 * 1000
            )
            const expression = `${nextMinute.getMinutes()} ${nextMinute.getHours()} * * *`
            cronServices.register({
              name: data._id,
              expression,
              handler: async () => {
                await this.executeTask(data)
              }
            })
          } else {
            cronServices.delete(data._id)
          }
        }
        resolve({
          code,
          data,
          message
        })
      } catch (error) {
        reject({ code: 500, data: null, message: error })
      }
    })
  }

  // 编辑任务
  updateTask(params: UpdateTaskParams): Promise<InterfaceResult<Inspection>> {
    return new Promise(async (resolve, reject) => {
      try {
        const { data, code, message } = await updateTaskAPI(params)
        if (!code) {
          const cronServices = CronServices.getInstance()
          if (data.executionMethod === 'AUTO') {
            const now = new Date()
            const nextMinute = new Date(
              now.getTime() + 60 * 1000
            )
            const expression = `${nextMinute.getMinutes()} ${nextMinute.getHours()} * * *`
            cronServices.register({
              name: data._id,
              expression,
              handler: async () => {
                await this.executeTask(data)
              }
            })
          } else {
            cronServices.delete(data._id)
          }
        }
        resolve({
          code,
          data,
          message
        })
      } catch (error) {
        reject({ code: 500, data: null, message: error })
      }
    })
  }

  // 删除任务
  deleteTask(params: { taskIds: string[] }): Promise<InterfaceResult<string>> {
    return new Promise(async (resolve, reject) => {
      try {
        const { data, code, message } = await deleteTaskAPI(params)
        resolve({
          code,
          data,
          message
        })
      } catch (error) {
        reject({ code: 500, data: null, message: error })
      }
    })
  }

  // 执行任务
  async executeTask(task: Inspection) {
    const { data } = await this.getRunningTaskList()
    if (data.length >= 4 || data.find(item => item._id === task._id)) return
    this.queue.add(async () => {
      const inspection = new InspectionServices(task, this.mainWindow!)
      const taskInfo = inspection.getTaskInfo()
      this.runningTasks.set(task._id, inspection)
      this.notifyTaskUpdate(task._id, 'running')
      try {
        await inspection.start()
      } catch (error) { }
      this.notifyTaskUpdate(task._id, taskInfo.status)
      this.runningTasks.delete(task._id)
    })
  }

  // 停止任务
  async stopTask(data: Inspection) {
    const task = this.runningTasks.get(data._id)
    if (task) {
      await task.stopTask()
    } else {
      const inspection = new InspectionServices(data, this.mainWindow!)
      this.notifyTaskUpdate(data._id, 'cancelled')
      this.runningTasks.set(data._id, inspection)
      try {
        await inspection.stopTask()
      } catch (error) {

      }
    }
  }
  /**
   * 获取任务信息
   */
  getTask(taskId: string) {
    const task = this.runningTasks.get(taskId)
    return task ? task.getTaskInfo() : null
  }
  // 通知视图更新
  private notifyTaskUpdate(taskId: string, status: string) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      const task = this.getTask(taskId)
      if (task) {
        this.mainWindow.webContents.send('inspection-task-status-update', { task, status })
      }
    }
  }


  // 获取商品列表
  getGoodsList(params: InspectionDetailParams): Promise<InterfaceResult<InspectionDetailList>> {
    return new Promise(async (resolve, reject) => {
      try {
        const { data, code, message } = await getInspectionDetailAPI(params)
        resolve({
          code,
          data,
          message
        })
      } catch (error) {
        reject({ code: 500, data: null, message: error })
      }
    })
  }

  // 获取商品详情
  getGoodsDetail(params: GoodsDetailParams): Promise<InterfaceResult<GoodsDetail>> {
    return new Promise(async (resolve, reject) => {
      try {
        const { data, code, message } = await getGoodsDetailAPI(params)
        resolve({
          code,
          data,
          message
        })
      } catch (error) {
        reject({ code: 500, data: null, message: error })
      }
    })
  }

  // 获取店铺列表
  getShopList(params: PageParams): Promise<InterfaceResult<ShopList>> {
    return new Promise(async (resolve, reject) => {
      try {
        const { data, code, message } = await getShopListAPI(params)
        resolve({
          code,
          data,
          message
        })
      } catch (error) {
        reject({ code: 500, data: null, message: error })
      }
    })
  }
}
