import { ipcMain, BrowserWindow } from 'electron'
import { TaskManager } from '../services/task-manager.service.js'
import log from '../log/index.js'
export const collectionIpc = (win: BrowserWindow) => {
  const taskManager = TaskManager.getInstance()
  taskManager.setMainWindow(win)

  // 创建任务
  ipcMain.handle('collection-create', async (event, data: any) => {
    try {
      const taskId = taskManager.addTask(data.data)
      const task = taskManager.getTask(taskId)!

      return {
        code: 200,
        message: '任务创建成功',
        data: task
      }
    } catch (error) {
      return {
        code: 500,
        message: error instanceof Error ? error.message : '任务创建失败',
        data: null
      }
    }
  })

  // 开始任务
  ipcMain.handle('collection-start-task', async (event, taskId: string) => {
    try {
      log.info(taskId, 'taskId')
      const success = taskManager.startTaskById(taskId)
      console.log(success)
      if (success) {
        return {
          code: 200,
          message: '任务启动成功',
          data: taskManager.getTask(taskId)
        }
      } else {
        return {
          code: 400,
          message: '无法启动任务',
          data: null
        }
      }
    } catch (error) {
      log.error(error)
      return {
        code: 500,
        message: error instanceof Error ? error.message : '启动任务失败',
        data: null
      }
    }
  })
  // 创建并启动任务
  ipcMain.handle('collection-create-and-start', async (event, { data }) => {
    try {
      // 创建任务
      const taskId = taskManager.addTask(data);

      // 立即启动任务
      const started = taskManager.startTaskById(taskId);

      if (started) {
        return { code: 200, message: '任务创建并启动成功', data: { id: taskId } };
      } else {
        return { code: 500, message: '任务启动失败', data: { id: taskId } };
      }
    } catch (error) {
      return { code: 500, message: error instanceof Error ? error.message : '未知错误', data: null }
    }
  });

  // 重新执行任务
  ipcMain.handle('collection-re-execute-task', async (event, taskId: string) => {
    try {
      const success = taskManager.reExecuteTask(taskId)
      if (success) {
        return {
          code: 200,
          message: '任务重新执行成功',
          data: taskManager.getTask(taskId)
        }
      } else {
        return {
          code: 400,
        }
      }
    } catch (error) {
      return {
        code: 500,
        message: error instanceof Error ? error.message : '任务重新执行失败',
        data: null
      }
    }
  })

  // 获取任务状态
  ipcMain.handle('collection-get-task', async (event, taskId: string) => {
    try {
      const task = taskManager.getTask(taskId)
      if (!task) {
        return {
          code: 404,
          message: '任务不存在',
          data: null
        }
      }

      return {
        code: 200,
        message: '获取任务成功',
        data: task
      }
    } catch (error) {
      return {
        code: 500,
        message: error instanceof Error ? error.message : '获取任务失败',
        data: null
      }
    }
  })

  // 获取所有任务
  ipcMain.handle('collection-get-all-tasks', async (event, params) => {
    try {
      const data = taskManager.getAllTasks(params)

      return {
        code: 200,
        message: '获取任务列表成功',
        data
      }
    } catch (error) {
      return {
        code: 500,
        message: error instanceof Error ? error.message : '获取任务失败',
        data: null
      }
    }
  })

  // 取消任务
  ipcMain.handle('collection-cancel-task', async (event, taskId: string) => {
    try {
      const success = taskManager.cancelTask(taskId)
      const task = taskManager.getTask(taskId)

      if (success) {
        return {
          code: 200,
          message: '任务取消成功',
          data: task
        }
      } else {
        return {
          code: 400,
          message: '无法取消任务',
          data: null
        }
      }
    } catch (error) {
      return {
        code: 500,
        message: error instanceof Error ? error.message : '取消任务失败',
        data: null
      }
    }
  })
  // 删除任务
  ipcMain.handle('collection-delete-task', async (event, taskId: string | string[]) => {
    try {
      const success = taskManager.deleteTask(taskId)
      if (success) {
        return {
          code: 200,
          message: '任务删除成功',
          data: null
        }
      } else {
        return {
          code: 400,
          message: '无法删除任务',
          data: null
        }
      }
    } catch (error) {
      return {
        code: 500,
        message: error instanceof Error ? error.message : '删除任务失败',
        data: null
      }
    }
  })
}