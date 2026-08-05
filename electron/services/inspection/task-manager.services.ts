
import { createTaskAPI, getTaskListAPI, updateTaskAPI, deleteTaskAPI, getInspectionDetailAPI, getGoodsDetailAPI } from "./api.js"
import { InspectionList, TaskParams, UpdateTaskParams, Inspection, InspectionDetailParams, InspectionDetailList } from './type'
import { InterfaceResult, PageParams } from '../../types/index'
import PQueue from 'p-queue'
import { InspectionServices } from './index.services.js'
import { BrowserWindow } from 'electron'
export class TaskManager {
  private static instance: TaskManager
  private queue: PQueue
  private runningTasks = new Map<string, any>()
  private mainWindow: BrowserWindow | null = null
  constructor() {
    this.queue = new PQueue({ concurrency: 10 })
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

  // 创建任务
  createTask(params: TaskParams): Promise<InterfaceResult<{ taskId: string }>> {
    return new Promise(async (resolve, reject) => {
      try {
        const { data, code, message } = await createTaskAPI(params)
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
  updateTask(params: UpdateTaskParams): Promise<InterfaceResult<string>> {
    return new Promise(async (resolve, reject) => {
      try {
        const { data, code, message } = await updateTaskAPI(params)
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
  executeTask(task: Inspection) {
    this.queue.add(async () => {
      const inspection = new InspectionServices(task, this.mainWindow!)
      this.runningTasks.set(task._id, inspection)
      await inspection.start()
    })
  }

  // 停止任务
  async stopTask(data: Inspection) {
    const task = this.runningTasks.get(data._id)
    if (task) {
      await task.stopTask()
    } else {
      const inspection = new InspectionServices(data, this.mainWindow!)
      this.runningTasks.set(data._id, inspection)
      await inspection.stopTask()
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
}
