import { BrowserWindow } from 'electron';
import { Collection, Task } from './collection.services.js';
import log from '../log/index.js';
import request from '../utils/request.js';
import dayjs from 'dayjs';
import fs from 'fs/promises'
export class TaskManager {
  private static instance: TaskManager;
  private tasks: Map<string, Collection> = new Map();
  private activeTasks: Set<string> = new Set();
  private maxConcurrentTasks = 5;
  private taskQueue: string[] = [];
  private mainWindow: BrowserWindow | null = null;
  private constructor() { }

  public static getInstance(): TaskManager {
    if (!TaskManager.instance) {
      TaskManager.instance = new TaskManager();
    }
    return TaskManager.instance;
  }

  setMainWindow(window: BrowserWindow) {
    this.mainWindow = window;
  }

  /**
   * 添加任务（仅创建任务，不立即执行）
   */
  addTask(taskData: Task): Promise<string> {
    return new Promise(async (resolve, reject) => {
      let collection: Collection | null = null;

      if (taskData._id) {
        // 如果是已有任务（有ID），则更新现有任务信息
        const existingCollection = this.tasks.get(taskData._id);
        if (existingCollection) {
          try {
            await request({
              url: '/api/auto/autoTask/editTask',
              method: 'post',
              data: {
                ...taskData,
                taskId: taskData._id,
              },
            });
            existingCollection.updateTaskData(taskData);
            collection = existingCollection;
          } catch (error) {
            log.error('更新任务数据失败', error);
            reject(error);
            return;
          }
        } else {
          // 如果是新创建带ID的任务，则直接使用传入的数据
          collection = new Collection(taskData, this.mainWindow!);
          this.tasks.set(taskData._id, collection);
        }
      } else {
        // 新任务，需要生成ID并补充信息
        try {
          const response = await request({
            url: '/api/auto/autoTask/createTask',
            method: 'post',
            data: taskData,
          });
          const newTaskData = { ...taskData, _id: response.data };
          collection = new Collection(newTaskData, this.mainWindow!);
          collection.complementTaskInfo();
          this.tasks.set(collection.getTaskInfo()._id, collection);
        } catch (error) {
          reject(error);
          return;
        }
      }

      if (!collection) {
        reject('创建任务时，Collection 未正确初始化');
        return;
      }

      const taskInfo = collection.getTaskInfo();
      resolve(taskInfo._id);
    });
  }

  /**
   * 开始执行任务
   */
  startTaskById(taskId: string): Promise<boolean> {
    this.refreshTaskQueue()
    return new Promise(async (resolve, reject) => {
      const task = this.tasks.get(taskId);
      if (!task) {
        reject('任务不存在');
        return;
      }
      // 检查任务是否允许重新执行
      const taskInfo = task.getTaskInfo();
      if (taskInfo.taskStatus === 'running') {
        reject('任务已在运行中');
        return;
      }

      if (this.activeTasks.size < this.maxConcurrentTasks) {
        this.executeTask(taskId);
      } else {
        task.updateStatus('pending')
        task.outputLog('pending')
        this.taskQueue.push(taskId);
      }
      resolve(true);
    });
  }

  /**
   * 实际执行任务
   */
  private async executeTask(taskId: string) {
    const task = this.tasks.get(taskId);
    if (!task) return;

    // 添加到活动任务并立即通知
    this.activeTasks.add(taskId);
    this.notifyTaskUpdate(taskId, 'running');

    try {
      await task.run();
    } finally {
      // 任务完成后清理并通知
      this.activeTasks.delete(taskId);
      this.notifyTaskUpdate(taskId, 'completed');

      // 处理队列中的下一个任务
      this.processNextTask();
    }
  }

  /**
   * 处理下一个待执行任务
   */
  private async processNextTask() {
    if (this.taskQueue.length > 0 && this.activeTasks.size < this.maxConcurrentTasks) {
      const nextTaskId = this.taskQueue.shift();
      if (nextTaskId) {
        this.executeTask(nextTaskId);
      }
    }
  }

  /**
   * 获取任务信息
   */
  getTask(taskId: string) {
    const task = this.tasks.get(taskId);
    return task ? task.getTaskInfo() : null;
  }

  /**
   * 获取任务列表（包括状态）
   */
  getAllTasksList() {
    const taskList: Task[] = [];
    for (const [_, collection] of this.tasks) {
      taskList.push(collection.getTaskInfo());
    }
    return taskList;
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
      });

      data.list.forEach((task: Task) => {
        task.createTime = dayjs(task.createTime).format('YYYY-MM-DD HH:mm:ss');
        task.updateTime = dayjs(task.updateTime).format('YYYY-MM-DD HH:mm:ss');
        if (!this.tasks.has(task._id)) {
          task.progress = task.progress || { current: 0, total: 0, totalCount: 0 };
          const collection = new Collection(task, this.mainWindow!)
          this.tasks.set(task._id, collection)
        } else {
          task.progress = this.tasks.get(task._id)?.getTaskInfo().progress
        }
        if (task.taskStatus !== 'noExecuted') task.tableFilePath = this.tasks.get(task._id)?.tableFilePath
      });

      return data;
    } catch (error) {
      log.error('获取任务列表失败', error);
      throw error;
    }
  }

  /**
   * 取消任务
   */
  cancelTask(taskId: string): Promise<boolean> {
    return new Promise(async (resolve, reject) => {
      const task = this.tasks.get(taskId);
      if (!task) {
        reject('任务不存在');
        return;
      }

      try {
        // 从任务队列中移除
        const queueIndex = this.taskQueue.indexOf(taskId);
        if (queueIndex > -1) {
          this.taskQueue.splice(queueIndex, 1);
        }

        // 如果任务在执行中，调用取消方法
        if (this.activeTasks.has(taskId)) {
          await task.cancel();
          this.activeTasks.delete(taskId);
        } else {
          // 如果任务不在执行中，直接更新状态
          task.updateStatus('cancelled');
          task.outputLog('取消任务')
        }

        // 通知状态更新
        this.notifyTaskUpdate(taskId, 'cancelled');

        // 处理队列中的下一个任务
        this.processNextTask();

        resolve(true);
      } catch (error) {
        log.error('取消任务失败', error);
        reject(error);
      }
    });
  }

  /**
   * 重新执行已完成或失败的任务
   */
  reExecuteTask(taskId: string): Promise<boolean> {
    this.refreshTaskQueue()
    return new Promise(async (resolve, reject) => {
      const task = this.tasks.get(taskId);
      if (!task) return reject('任务不存在');

      const taskInfo = task!.getTaskInfo();
      // 只有已完成、失败或已取消的任务才能重新执行
      if (['completed', 'failed', 'cancelled'].includes(taskInfo.taskStatus)) {
        task.resetTask(); // 重置任务状态

        // 立即更新状态并通知
        if (this.activeTasks.size < this.maxConcurrentTasks) {
          this.executeTask(taskId);
        } else {
          if (this.taskQueue.includes(taskId)) return
          task.updateStatus('pending')
          task.outputLog('pending')
          this.taskQueue.push(taskId);
        }
        resolve(true);
      } else {
        reject('任务状态不允许重新执行');
      }
      resolve(true)
    });
  }

  /**
   * 删除任务
   */
  async deleteTask(taskId: string | string[]): Promise<boolean> {
    const taskIds = Array.isArray(taskId) ? taskId : [taskId];
    let successCount = 0;

    for (const id of taskIds) {
      const task = this.tasks.get(id);
      if (!task) continue;

      try {
        // 如果任务在执行或队列中，先取消
        if (this.activeTasks.has(id) || this.taskQueue.includes(id)) {
          this.cancelTask(id);
        }

        // 从服务器删除
        await request({
          url: '/api/auto/autoTask/deleteTask', // 或者使用批量删除接口
          method: 'post',
          data: { taskId: id },
        });

        // 从本地缓存删除
        if (this.tasks.delete(id)) {
          successCount++;
        }

        try {
          await fs.access(task.tableFilePath)
          await fs.unlink(task.tableFilePath)
        } catch (error) {
          log.error('删除任务文件失败', error)
        }
      } catch (error) {
        log.error(`删除任务 ${id} 失败`, error);
      }
    }

    // 如果是批量删除，检查是否有部分成功
    if (Array.isArray(taskId)) {
      return successCount > 0;
    } else {
      return successCount === 1;
    }
  }

  /**
   * 通知任务状态更新
   */
  private notifyTaskUpdate(taskId: string, status: string) {
    if (this.mainWindow) {
      const task = this.getTask(taskId);
      if (task) {
        this.mainWindow.webContents.send('task-status-update', { task, status });
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
      });

      let successCount = 0;
      for (const id of taskIds) {
        const task = this.tasks.get(id);
        if (!task) continue;

        // 如果任务在执行或队列中，先取消
        if (this.activeTasks.has(id) || this.taskQueue.includes(id)) {
          this.cancelTask(id);
        }

        if (this.tasks.delete(id)) {
          successCount++;
        }

        try {
          await fs.access(task.tableFilePath)
          await fs.unlink(task.tableFilePath)
        } catch (error) {
          log.error('删除任务文件失败', error)
        }
      }

      return successCount > 0;
    } catch (error) {
      log.error('批量删除任务失败', error);
      throw error;
    }
  }

  // 下载表格
  downloadExcel(taskId: string) {
    const task = this.tasks.get(taskId)
    if (!task) log.error('找不到该任务')
    try {
      this.mainWindow?.webContents.downloadURL(`file://${task!.tableFilePath}`)
    } catch (error) {
      log.error('下载表格失败', error)
    }
  }

  // 刷新队列
  refreshTaskQueue() {
    if (this.activeTasks.size) {
      for (const taskId of this.activeTasks) {
        const task = this.tasks.get(taskId)
        if (task && task.getStatus() !== 'running') {
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
    log.info('开始停止所有任务...');

    // 收集所有需要处理的任务ID
    const allTaskIds = Array.from(this.tasks.keys());

    // 首先清空任务队列
    this.taskQueue = [];

    // 取消所有活跃任务
    for (const taskId of [...this.activeTasks]) { // 使用副本避免迭代时修改
      try {
        await this.cancelTask(taskId);
      } catch (error) {
        log.error(`取消活跃任务 ${taskId} 失败:`, error);
      }
    }

    // 更新所有其他任务的状态为已取消
    for (const taskId of allTaskIds) {
      if (!this.activeTasks.has(taskId)) { // 不是活跃任务
        const task = this.tasks.get(taskId);
        if (task && task.getStatus() !== 'cancelled' && task.getStatus() !== 'completed') {
          task.updateStatus('cancelled');
          task.outputLog('用户切换登录，任务被取消');

          // 通知前端状态变更
          this.notifyTaskUpdate(taskId, 'cancelled');
        }
      }
    }


    log.info('所有任务已停止');
  }
}