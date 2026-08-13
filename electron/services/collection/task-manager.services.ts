import { BrowserWindow } from 'electron'
import { Collection } from './collection.services.js'
import log from '../../log/index.js'
import request from '../../utils/request.js'
import { Task } from './type.js'
import { SysTemUtils } from '../../utils/system.js'
import { memoryMonitor } from '../memory-monitor.services.js'
import { autoUpGoods, autoSaveData } from './interface.services.js'
import { operationStore } from '../../store/index.js'
import os from 'os'
import { join } from 'path'
const excelDir = join(SysTemUtils.getAppInfo().userDataPath, 'excel')
export class TaskManager {
  private static instance: TaskManager
  private tasks: Map<string, Collection> = new Map()
  private activeTasks: Set<string> = new Set()
  private maxConcurrentTasks
  private taskQueue: string[] = []
  private mainWindow: BrowserWindow | null = null
  private filePathList: Map<
    string,
    { filePath: string; progress: any; autoResult?: string; upGoodsList: any[] }
  > = new Map()
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
          collection = new Collection(
            { ...response.data, _id: response.data.taskId },
            this.mainWindow!,
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
        const collection = new Collection(newTaskData, this.mainWindow!)
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
  startTaskById(taskId: string): Promise<boolean> {
    this.refreshTaskQueue()
    return new Promise(async (resolve, reject) => {
      const task = this.tasks.get(taskId)
      if (!task) {
        reject('任务不存在')
        return
      }
      // 检查任务是否允许重新执行
      const taskInfo = task.getTaskInfo()
      if (taskInfo.taskStatus === 'running') {
        reject('任务已在运行中')
        return
      }

      if (this.activeTasks.size < this.maxConcurrentTasks) {
        this.executeTask(taskId)
      } else {
        task.updateStatus('pending')
        task.outputLog('pending')
        if (!this.taskQueue.includes(taskId)) this.taskQueue.push(taskId)
      }
      resolve(true)
    })
  }

  /**
   * 实际执行任务
   */
  private async executeTask(taskId: string) {
    const task = this.tasks.get(taskId)
    if (!task) return

    // 记录任务开始前的内存
    memoryMonitor.trackBusinessMetrics({
      taskCount: this.tasks.size,
      activeTaskCount: this.activeTasks.size,
      queueSize: this.taskQueue.length,
    })

    // 添加到活动任务并立即通知
    this.activeTasks.add(taskId)
    this.notifyTaskUpdate(taskId, 'running')
    try {
      const result = await task.run()
      if (task.getTaskInfo().taskStatus === 'completed')
        this.mainWindow?.webContents.send('task-completed', {
          message: `任务：${task.getTaskInfo().taskName}已完成`,
        })
      this.filePathList.set(taskId, JSON.parse(JSON.stringify(result)))
    } catch (error) {
      this.filePathList.set(taskId, JSON.parse(JSON.stringify(error)))
    } finally {
      // 任务完成后清理并通知
      task.clearStatus(false, true)
      this.activeTasks.delete(taskId)
      this.notifyTaskUpdate(taskId, 'completed')
      this.tasks.delete(taskId)
      memoryMonitor.trackBusinessMetrics({
        taskCount: this.tasks.size,
        activeTaskCount: this.activeTasks.size,
        queueSize: this.taskQueue.length,
        filePathListSize: this.filePathList.size,
      })
      // 内存压力大时，触发GC
      const usage = process.memoryUsage()
      if (usage.heapUsed > 800 * 1024 * 1024) {
        log.warn('[TaskManager] 内存压力大，触发 GC')
        memoryMonitor.forceGC()
      }
      // 处理队列中的下一个任务
      this.processNextTask()
    }
  }

  /**
   * 处理下一个待执行任务
   */
  private async processNextTask() {
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
    return task ? task.getTaskInfo() : null
  }

  /**
   * 获取任务列表（包括状态）
   */
  getAllTasksList() {
    const taskList: Task[] = []
    for (const [_, collection] of this.tasks) {
      taskList.push(collection.getTaskInfo())
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
        const copyTask = this.filePathList.get(task._id)
        if (!this.tasks.has(task._id)) {
          task.progress =
            task.taskStatus !== 'pending'
              ? copyTask?.progress || { current: 0, total: 0, totalCount: 0 }
              : { current: 0, total: 0, totalCount: 0 }
          task.tableFilePath = copyTask?.filePath
          task.autoResult = copyTask?.autoResult
          /*           const collection = new Collection(task, this.mainWindow!)
                    this.tasks.set(task._id, collection) */
        } else {
          const progress2 = JSON.parse(
            JSON.stringify(this.tasks.get(task._id)?.getTaskInfo().progress) || '{}',
          )
          const filePath = this.tasks.get(task._id)?.getTaskInfo()?.tableFilePath
          if (task.taskStatus === 'running' || task.taskStatus === 'pending') {
            if (filePath && SysTemUtils.fileOperations.exists(filePath))
              task.tableFilePath = filePath
            task.progress = progress2
          } else {
            task.progress = copyTask?.progress || { current: 0, total: 0, totalCount: 0 }
            task.autoResult = copyTask?.autoResult
            if (copyTask && SysTemUtils.fileOperations.exists(copyTask.filePath))
              task.tableFilePath = copyTask.filePath
          }
        }
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
  cancelTask(taskId: string): Promise<boolean> {
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
          this.activeTasks.delete(taskId)
        } else {
          // 如果任务不在执行中，直接更新状态
          task.updateStatus('cancelled')
          task.outputLog('取消任务')
        }

        // 通知状态更新
        this.notifyTaskUpdate(taskId, 'cancelled')

        // 处理队列中的下一个任务
        this.processNextTask()

        resolve(true)
      } catch (error) {
        log.error('取消任务失败', error)
        reject(error)
      }
    })
  }

  /**
   * 重新执行已完成或失败的任务
   */
  reExecuteTask(taskId: string): Promise<boolean> {
    this.refreshTaskQueue()
    return new Promise(async (resolve, reject) => {
      const task = this.tasks.get(taskId)

      if (!task) return reject('任务不存在')

      const taskInfo = task!.getTaskInfo()
      // 只有已完成、失败或已取消的任务才能重新执行
      if (['completed', 'failed', 'cancelled'].includes(taskInfo.taskStatus)) {
        // 立即更新状态并通知
        if (this.activeTasks.size < this.maxConcurrentTasks) {
          this.executeTask(taskId)
        } else {
          if (this.taskQueue.includes(taskId)) return
          task.updateStatus('pending')
          task.outputLog('pending')
          this.filePathList.delete(taskId)
          this.taskQueue.push(taskId)
        }
        resolve(true)
      } else {
        reject('任务状态不允许重新执行')
      }
      resolve(true)
    })
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
  private notifyTaskUpdate(taskId: string, status: string) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      const task = this.getTask(taskId)
      if (task) {
        this.mainWindow.webContents.send('task-status-update', { task, status })
      }
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
    if (this.activeTasks.size) {
      for (const taskId of this.activeTasks) {
        const task = this.tasks.get(taskId)
        if (task && task.getTaskInfo().taskStatus !== 'running') {
          this.activeTasks.delete(taskId)
        }
      }
      this.processNextTask()
    }
  }

  /**
   * 终止所有任务（切换登录时调用）
   */
  async stopAllTasks(): Promise<void> {
    // 首先清空任务队列
    this.taskQueue = []

    // 取消所有活跃任务
    for (const taskId of [...this.activeTasks]) {
      // 使用副本避免迭代时修改
      try {
        await this.cancelTask(taskId)
      } catch (error) {
        log.error(`取消活跃任务 ${taskId} 失败:`, error)
      }
    }

    try {
      await request({ url: '/api/auto/autoTask/resetStatus', method: 'post', data: {} })
    } catch (error) {
      log.error('重置任务状态失败:', error)
    }
    this.tasks.clear()
    this.filePathList.clear()
  }

  // 上架
  async upGoods(task: Task) {
    const result = this.filePathList.get(task._id)
    if (!result) return Promise.reject('任务不存在')
    const data = new Map()
    result.upGoodsList.forEach((item: any) => data.set(item.id, item))
    return autoUpGoods(task, data)
  }

  // 保存数据
  /*   async saveData(list: any[]) {
      const taskList = operationStore.get('taskList') || []
      for (const item of list) {
        const localData = operationStore.get(item)
        if (localData) {
          const code = await autoSaveData({ taskId: item, datas: localData.taskData })
          if (!code) {
            operationStore.delete(item)
            taskList.splice(taskList.indexOf(item), 1)
            operationStore.set('taskList', taskList)
          }
        }
      }
    } */
}
