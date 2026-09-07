import { ipcMain, BrowserWindow, shell, app } from 'electron'
import { TaskManager } from '../services/collection/task-manager.services.js'
import { SysTemUtils } from '../utils/system.js'
import log from '../log/index.js'
import {
  getShopList,
  getLogisticsList,
  getConfigList,
  getCategoryList,
} from '../services/collection/interface.services.js'
import { join } from 'node:path'
export const collectionIpc = (win: BrowserWindow) => {
  const taskManager = TaskManager.getInstance()
  taskManager.setMainWindow(win)

  // 创建任务
  ipcMain.handle('collection-create', async (event, data: any) => {
    try {
      const taskId = await taskManager.addTask(data.data)
      const task = taskManager.getTask(taskId)!
      return {
        code: 200,
        message: '任务创建成功',
        data: task,
      }
    } catch (error) {
      log.error('创建任务失败', error)
      return {
        code: 500,
        message: error instanceof Error ? error.message : String(error),
        data: null,
      }
    }
  })

  // 复制任务
  ipcMain.handle('collection-copy', async (event, data: any) => {
    const taskId = await taskManager.copyTask(data.data)
    const task = taskManager.getTask(taskId)!
    try {
      return {
        code: 200,
        message: '任务复制成功',
        data: task,
      }
    } catch (error) {
      log.error('复制任务失败', error)
      return {
        code: 500,
        message: error instanceof Error ? error.message : String(error),
        data: null,
      }
    }
  })

  // 开始任务
  ipcMain.handle('collection-start-task', async (event, taskId: string) => {
    try {
      const success = await taskManager.startTaskById(taskId)

      if (success) {
        return {
          code: 200,
          message: '任务启动成功',
          data: taskManager.getTask(taskId),
        }
      } else {
        return {
          code: 400,
          message: '无法启动任务',
          data: null,
        }
      }
    } catch (error) {
      log.error('启动任务失败', error)
      return {
        code: 500,
        message: error instanceof Error ? error.message : String(error),
        data: null,
      }
    }
  })

  // 创建并启动任务
  ipcMain.handle('collection-create-and-start', async (event, { data }) => {
    try {
      // 创建任务
      const taskId = await taskManager.addTask(data)
      // 立即启动任务
      if (!taskId) throw new Error('任务创建失败')
      const task = taskManager.getTask(taskId)

      const started = ['completed', 'failed', 'cancelled'].includes(task!.taskStatus)
        ? await taskManager.reExecuteTask(taskId)
        : await taskManager.startTaskById(taskId)
      if (started) {
        return { code: 200, message: '任务创建并启动成功', data: { id: taskId } }
      } else {
        return { code: 500, message: '任务启动失败', data: { id: taskId } }
      }
    } catch (error) {
      log.error('创建并启动任务失败', error)
      return {
        code: 500,
        message: error,
        data: null,
      }
    }
  })

  // 重新执行任务
  ipcMain.handle('collection-re-execute-task', async (event, taskId: string) => {
    try {
      const success = await taskManager.reExecuteTask(taskId)
      if (success) {
        return {
          code: 200,
          message: '任务重新执行成功',
          data: taskManager.getTask(taskId),
        }
      } else {
        return {
          code: 400,
          message: '无法重新执行任务',
          data: null,
        }
      }
    } catch (error) {
      log.error('重新执行任务失败', error)
      return {
        code: 500,
        message: error instanceof Error ? error.message : String(error),
        data: null,
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
          data: null,
        }
      }

      return {
        code: 200,
        message: '获取任务成功',
        data: task,
      }
    } catch (error) {
      log.error('获取任务失败', error)
      return {
        code: 500,
        message: error instanceof Error ? error.message : '获取任务失败',
        data: null,
      }
    }
  })

  // 获取所有任务
  ipcMain.handle('collection-get-all-tasks', async (event, params) => {
    try {
      const data = params?.pageNo
        ? await taskManager.getAllTasks(params)
        : await taskManager.getAllTasksList()
      return {
        code: 200,
        message: '获取任务列表成功',
        data,
      }
    } catch (error) {
      log.error('获取任务列表失败', error)
      return {
        code: 500,
        message: error instanceof Error ? error.message : '获取任务失败',
        data: null,
      }
    }
  })

  // 获取正在执行的任务
  ipcMain.handle('collection-get-running-task', async (event, data) => {
    const list = await taskManager.getActiveTasks()
    return {
      code: 200,
      message: '获取成功',
      data: list
    }
  })

  // 取消任务
  ipcMain.handle('collection-cancel-task', async (event, taskId: string) => {
    try {
      const success = await taskManager.cancelTask(taskId)
      const task = taskManager.getTask(taskId)

      if (success) {
        return {
          code: 200,
          message: '任务取消成功',
          data: task,
        }
      } else {
        return {
          code: 400,
          message: '无法取消任务',
          data: null,
        }
      }
    } catch (error) {
      log.error('取消任务失败', error)
      return {
        code: 500,
        message: error instanceof Error ? error.message : String(error),
        data: null,
      }
    }
  })

  // 取消所有任务
  ipcMain.handle('collection-cancel-all-task', async (event, refresh: boolean = false) => {
    try {
      await taskManager.stopAllTasks()
      if (refresh) win.webContents.send('refresh-task-list')
      return true
    } catch (error) {
      log.error(error)
      return true
    }
  })

  // 删除任务
  ipcMain.handle('collection-delete-task', async (event, taskId: string | string[]) => {
    try {
      let success: boolean
      if (Array.isArray(taskId)) {
        success = await taskManager.deleteMultipleTasks(taskId)
      } else {
        success = await taskManager.deleteTask(taskId)
      }

      if (success) {
        return {
          code: 200,
          message: '任务删除成功',
          data: null,
        }
      } else {
        return {
          code: 400,
          message: '无法删除任务',
          data: null,
        }
      }
    } catch (error) {
      log.error('删除任务失败', error)
      return {
        code: 500,
        message: error instanceof Error ? error.message : '删除任务失败',
        data: null,
      }
    }
  })

  // 下载表格
  ipcMain.handle('collection-download-excel', async (event, tableFilePath: string) => {
    return await taskManager.downloadExcel(tableFilePath)
  })

  // 获取物流
  ipcMain.handle('get-logistics-list', async (event, params) => {
    return await getLogisticsList()
  })

  // 获取店铺
  ipcMain.handle('get-shop-list', async (event, params) => {
    return await getShopList()
  })

  // 获取店铺配置
  ipcMain.handle('get-config-list', async (event, params) => {
    return await getConfigList()
  })

  // 获取分类
  ipcMain.handle('get-category-list', async (event, params) => {
    return await getCategoryList()
  })

  // 跳转EPR
  ipcMain.on('go-erp', (event, data) => {
    const env = SysTemUtils.getEnv() === 'development'
    const url = env ? 'https://test-ozon.shopbang.cn/erp/#/' : 'https://ozon.shopbang.cn/erp/#/'
    shell.openExternal(`${url}${data}`)
  })

  // 上架商品
  ipcMain.handle('up-goods', async (event, data) => {
    const res = await taskManager.upGoods(data)
    if (res !== 'success') {
      return {
        code: 500,
        message: res,
        data: null,
      }
    } else {
      return {
        code: 200,
        message: '上架成功',
        data: null,
      }
    }
  })

  // 获取当前任务数
  ipcMain.handle('get-current-task-count', async (event) => {
    return taskManager.getConcurrentTaskCount()
  })

  // 设置最大并发任务数
  ipcMain.handle('set-max-concurrent-task-count', async (event, count) => {
    taskManager.setMaxConcurrentTasks(count)
    return true
  })

  // 下载所有表格
  ipcMain.handle('download-all-tables', async (event) => {
    try {
      const desktopPath = app.getPath('desktop')
      const excelDir = join(SysTemUtils.getAppInfo().userDataPath, 'excel')
      const timestamp = new Date().getTime()
      const folderName = `sp_bang_${timestamp}`
      const dest = join(desktopPath, folderName)
      await SysTemUtils.fileOperations.copyFolder(excelDir, dest)
    } catch (error) {
      log.error('导出所有表格失败~', error)
    }
    return true
  })
}
