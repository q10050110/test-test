import { ipcMain, BrowserWindow } from 'electron';
import { TaskManager } from '../services/task-manager.service.js';
import log from '../log/index.js';

export const collectionIpc = (win: BrowserWindow) => {
  const taskManager = TaskManager.getInstance();
  taskManager.setMainWindow(win);

  // 创建任务
  ipcMain.handle('collection-create', async (event, data: any) => {
    try {
      const taskId = await taskManager.addTask(data.data);
      const task = taskManager.getTask(taskId)!;
      return {
        code: 200,
        message: '任务创建成功',
        data: task,
      };
    } catch (error) {
      log.error('创建任务失败', error);
      return {
        code: 500,
        message: error instanceof Error ? error.message : String(error),
        data: null,
      };
    }
  });

  // 开始任务
  ipcMain.handle('collection-start-task', async (event, taskId: string) => {
    try {
      const success = await taskManager.startTaskById(taskId);

      if (success) {
        return {
          code: 200,
          message: '任务启动成功',
          data: taskManager.getTask(taskId),
        };
      } else {
        return {
          code: 400,
          message: '无法启动任务',
          data: null,
        };
      }
    } catch (error) {
      log.error('启动任务失败', error);
      return {
        code: 500,
        message: error instanceof Error ? error.message : String(error),
        data: null,
      };
    }
  });

  // 创建并启动任务
  ipcMain.handle('collection-create-and-start', async (event, { data }) => {
    try {
      // 创建任务
      const taskId = await taskManager.addTask(data);
      // 立即启动任务
      if (!taskId) throw new Error('任务创建失败')
      const started = await taskManager.startTaskById(taskId);
      if (started) {
        return { code: 200, message: '任务创建并启动成功', data: { id: taskId } };
      } else {
        return { code: 500, message: '任务启动失败', data: { id: taskId } };
      }
    } catch (error) {
      log.error('创建并启动任务失败', error);
      return {
        code: 500,
        message: error instanceof Error ? error.message : '未知错误',
        data: null
      };
    }
  });

  // 重新执行任务
  ipcMain.handle('collection-re-execute-task', async (event, taskId: string) => {
    try {
      const success = await taskManager.reExecuteTask(taskId);
      console.log(success, 'success')
      if (success) {
        return {
          code: 200,
          message: '任务重新执行成功',
          data: taskManager.getTask(taskId),
        };
      } else {
        return {
          code: 400,
          message: '无法重新执行任务',
          data: null,
        };
      }
    } catch (error) {
      log.error('重新执行任务失败', error);
      return {
        code: 500,
        message: error instanceof Error ? error.message : String(error),
        data: null,
      };
    }
  });

  // 获取任务状态
  ipcMain.handle('collection-get-task', async (event, taskId: string) => {
    try {
      const task = taskManager.getTask(taskId);
      if (!task) {
        return {
          code: 404,
          message: '任务不存在',
          data: null,
        };
      }

      return {
        code: 200,
        message: '获取任务成功',
        data: task,
      };
    } catch (error) {
      log.error('获取任务失败', error);
      return {
        code: 500,
        message: error instanceof Error ? error.message : '获取任务失败',
        data: null,
      };
    }
  });

  // 获取所有任务
  ipcMain.handle('collection-get-all-tasks', async (event, params) => {
    try {
      const data = await taskManager.getAllTasks(params);
      return data;
    } catch (error) {
      log.error('获取任务列表失败', error);
      return {
        code: 500,
        message: error instanceof Error ? error.message : '获取任务失败',
        data: null,
      };
    }
  });

  // 取消任务
  ipcMain.handle('collection-cancel-task', async (event, taskId: string) => {
    try {
      const success = await taskManager.cancelTask(taskId);
      const task = taskManager.getTask(taskId);

      if (success) {
        return {
          code: 200,
          message: '任务取消成功',
          data: task,
        };
      } else {
        return {
          code: 400,
          message: '无法取消任务',
          data: null,
        };
      }
    } catch (error) {
      log.error('取消任务失败', error);
      return {
        code: 500,
        message: error instanceof Error ? error.message : String(error),
        data: null,
      };
    }
  });

  // 删除任务
  ipcMain.handle('collection-delete-task', async (event, taskId: string | string[]) => {
    try {
      let success: boolean;
      if (Array.isArray(taskId)) {
        success = await taskManager.deleteMultipleTasks(taskId);
      } else {
        success = await taskManager.deleteTask(taskId);
      }

      if (success) {
        return {
          code: 200,
          message: '任务删除成功',
          data: null,
        };
      } else {
        return {
          code: 400,
          message: '无法删除任务',
          data: null,
        };
      }
    } catch (error) {
      log.error('删除任务失败', error);
      return {
        code: 500,
        message: error instanceof Error ? error.message : '删除任务失败',
        data: null,
      };
    }
  });

  // 下载表格
  ipcMain.handle('collection-download-excel', async (event, taskId: string) => {
    return await taskManager.downloadExcel(taskId)
  })
};