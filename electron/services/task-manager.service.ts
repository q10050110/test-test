import { BrowserWindow } from 'electron'
import { Collection, Task } from './collection.services.js'
import log from '../log/index.js'
export class TaskManager {
  private static instance: TaskManager
  private tasks: Map<string, Collection> = new Map()
  private activeTasks: Set<string> = new Set()
  private maxConcurrentTasks = 5
  private taskQueue: string[] = []
  private mainWindow: BrowserWindow | null = null

  private constructor() { }

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
   * 添加任务（仅创建任务，不立即执行）
   */
  addTask(taskData: Task): string {
    let collection: Collection;

    if (taskData.id) {
      // 如果是已有任务（有ID），则更新现有任务信息
      const existingCollection = this.tasks.get(taskData.id)
      if (existingCollection) {
        existingCollection.updateTaskData(taskData)
        collection = existingCollection
      } else {
        // 如果是新创建带ID的任务，则直接使用传入的数据
        collection = new Collection(taskData, this.mainWindow!)
        this.tasks.set(taskData.id, collection)
      }
    } else {
      // 新任务，需要生成ID并补充信息
      collection = new Collection(taskData, this.mainWindow!)
      collection.complementTaskInfo()
      const taskInfo = collection.getTaskInfo()
      this.tasks.set(taskInfo.id, collection)
      log.info('新任务创建', collection, this.tasks.has(taskInfo.id))
    }
    const taskInfo = collection.getTaskInfo()
    // 不自动执行，只通知任务创建
    collection.updateStatus('noExecuted', '创建任务成功')
    this.notifyTaskUpdate(taskInfo.id)
    return taskInfo.id
  }

  /**
   * 开始执行任务
   */
  startTaskById(taskId: string): boolean {
    const task = this.tasks.get(taskId)
    if (!task) {
      return false
    }

    // 检查任务是否允许重新执行
    const taskInfo = task.getTaskInfo()
    if (taskInfo.status === 'running') {
      return false // 任务已在运行中
    }

    // 更新任务状态
    task.updateStatus('pending', '等待执行...')

    if (this.activeTasks.size < this.maxConcurrentTasks) {
      this.executeTask(taskId)
    } else {
      this.taskQueue.push(taskId)
      this.notifyTaskUpdate(taskId) // 更新状态为排队中
    }

    return true
  }

  /**
   * 实际执行任务
   */
  private async executeTask(taskId: string) {
    const task = this.tasks.get(taskId)
    if (!task) return

    this.activeTasks.add(taskId)
    task.updateStatus('running', '任务开始执行...')
    this.notifyTaskUpdate(taskId)

    try {
      await task.run()
    } finally {
      this.activeTasks.delete(taskId)
      this.notifyTaskUpdate(taskId)

      this.processNextTask()
    }
  }

  /**
   * 处理下一个待执行任务
   */
  private processNextTask() {
    if (this.taskQueue.length > 0 && this.activeTasks.size < this.maxConcurrentTasks) {
      const nextTaskId = this.taskQueue.shift()
      if (nextTaskId) this.executeTask(nextTaskId)
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
   * 分页获取所有任务
   */
  getAllTasks(params: { page: number; pageSize: number }): { total: number; list: Task[] } {
    const arr = Array.from(this.tasks.values()).map(task => task.getTaskInfo())
    const start = (params.page - 1) * params.pageSize
    const end = start + params.pageSize
    const data = {
      total: arr.length,
      list: arr.slice(start, end)
    }
    return data
  }

  /**
   * 取消任务
   */
  cancelTask(taskId: string): boolean {
    const task = this.tasks.get(taskId)
    if (!task) return false

    // 从任务队列中移除
    const queueIndex = this.taskQueue.indexOf(taskId)
    if (queueIndex > -1) {
      this.taskQueue.splice(queueIndex, 1)
      task.updateStatus('cancelled', '任务已取消')
      this.notifyTaskUpdate(taskId)
      return true
    }

    if (this.activeTasks.has(taskId)) {
      task.cancel()
      this.activeTasks.delete(taskId)
      this.notifyTaskUpdate(taskId)

      this.processNextTask()
      return true
    }

    // 如果任务不在执行或队列中，仍可以标记为已取消
    task.updateStatus('cancelled', '任务已取消')
    this.notifyTaskUpdate(taskId)
    return true
  }

  /**
   * 重新执行已完成或失败的任务
   */
  reExecuteTask(taskId: string): boolean {
    const task = this.tasks.get(taskId)
    if (!task) return false

    const taskInfo = task.getTaskInfo()
    // 只有已完成、失败或已取消的任务才能重新执行
    if (['completed', 'failed', 'cancelled'].includes(taskInfo.status)) {
      task.resetTask() // 重置任务状态
      task.updateStatus('pending', '等待重新执行...')

      if (this.activeTasks.size < this.maxConcurrentTasks) {
        this.executeTask(taskId)
      } else {
        this.taskQueue.push(taskId)
      }

      this.notifyTaskUpdate(taskId)
      return true
    }

    return false
  }

  /**
   * 删除任务
   */
  deleteTask(taskId: string | string[]): boolean {
    if (Array.isArray(taskId)) {
      // 批量删除多个任务
      let successCount = 0;

      for (const id of taskId) {
        const task = this.tasks.get(id);
        if (!task) continue;

        // 如果任务在执行或队列中，先取消
        if (this.activeTasks.has(id) || this.taskQueue.includes(id)) {
          this.cancelTask(id);
        }

        if (this.tasks.delete(id)) {
          successCount++;
        }
      }

      return successCount > 0;
    } else {
      // 删除单个任务
      const task = this.tasks.get(taskId);
      if (!task) return false;

      // 如果任务在执行或队列中，先取消
      if (this.activeTasks.has(taskId) || this.taskQueue.includes(taskId)) {
        this.cancelTask(taskId);
      }

      return this.tasks.delete(taskId);
    }
  }

  /**
   * 通知任务状态更新
   */
  private notifyTaskUpdate(taskId: string) {
    if (this.mainWindow) {
      const task = this.getTask(taskId)
      if (task) {
        this.mainWindow.webContents.send('task-status-update', task)
      }
    }
  }
}