import { ipcMain, shell } from 'electron'
import { TaskManager } from '../services/inspection/task-manager.services.js'
import { PageParams } from '../types'
import { TaskParams, Inspection, InspectionDetailParams, GoodsDetailParams } from '../services/inspection/type'
import { BrowserWindow } from 'electron'
export const inspectionIpc = (window: BrowserWindow) => {
  const taskManager = TaskManager.getInstance()
  taskManager.setMainWindow(window)
  // 获取任务列表
  ipcMain.handle('inspection-get-task-list', async (event, params: PageParams) => {
    try {
      const { data = [], code, message } = await taskManager.getTaskList(params)
      return { data, code, message }
    } catch (error) {
      console.log(error)
      return {
        data: null,
        code: 500,
        message: error instanceof Error ? error.message : String(error),
      }
    }
  })

  // 获取正在执行的任务
  ipcMain.handle('inspection-get-running-task', async () => {
    try {
      const { data, code, message } = await taskManager.getRunningTaskList()
      return { data, code, message }
    } catch (error) {
      return error
    }
  })

  // 创建任务
  ipcMain.handle('inspection-create-task', async (event, params: TaskParams) => {
    try {
      const { data, code, message } = await taskManager.createTask(params)
      return { data, code, message }
    } catch (error) {
      return error
    }
  })

  // 编辑任务
  ipcMain.handle(
    'inspection-update-task',
    async (event, params: TaskParams & { taskId: string }) => {
      try {
        const { data, code, message } = await taskManager.updateTask(params)
        return { data, code, message }
      } catch (error) {
        return error
      }
    },
  )
  // 删除任务
  ipcMain.handle('inspection-delete-task', async (event, params: { taskIds: string[] }) => {
    try {
      const { data, code, message } = await taskManager.deleteTask(params)
      return { data, code, message }
    } catch (error) {
      return error
    }
  })
  // 执行任务
  ipcMain.handle('inspection-execute-task', async (event, task: Inspection) => {
    try {
      taskManager.executeTask(task)
      return { data: null, code: 0, message: '任务执行成功' }
    } catch (error) {
      return { data: null, code: 500, message: '系统错误' }
    }
  })
  // 停止任务
  ipcMain.handle('inspection-stop-task', async (event, task: Inspection) => {
    try {
      taskManager.stopTask(task)
      return { data: null, code: 0, message: '任务停止成功' }
    } catch (error) {
      console.log(error, '出啥错误了')
      return { data: null, code: 500, message: '系统错误' }
    }
  })



  // 跳转至OZON详情页
  ipcMain.on('go-ozon-detail', (event, url: string) => {
    shell.openExternal(url)
  })


  // 获取商品列表
  ipcMain.handle(
    'inspection-get-goods-list',
    async (event, params: InspectionDetailParams) => {
      try {
        const { data, code, message } = await taskManager.getGoodsList(params)
        return { data, code, message }
      } catch (error) {
        return error
      }
    },
  )

  // 获取商品详情
  ipcMain.handle(
    'inspection-get-goods-detail',
    async (event, params: GoodsDetailParams) => {
      try {
        const { data, code, message } = await taskManager.getGoodsDetail(params)
        return { data, code, message }
      } catch (error) {
        return error
      }
    },
  )

  // 获取店铺列表
  ipcMain.handle(
    'inspection-get-shop-list',
    async (event, params: PageParams) => {
      try {
        const { data, code, message } = await taskManager.getShopList(params)
        return { data, code, message }
      } catch (error) {
        return error
      }
    },
  )
}
