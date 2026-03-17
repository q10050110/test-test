import { shell, clipboard, BrowserWindow } from 'electron'
import request from '../utils/request.js'
import { operationStore } from '../store/index.js'
import { SysTemUtils } from '../utils/system.js'
import { InterfaceResult } from '../types/index.js'
import { TaskManager } from './collection/task-manager.services.js'
export const accountHandle = async (type: 'register' | 'resetPassword', mainWindow: BrowserWindow) => {
  const env = SysTemUtils.getEnv() === 'development'
  const testUrl =
    type === 'register'
      ? 'https://test-plus.shopbang.cn/erp/#/register'
      : 'https://test-plus.shopbang.cn/erp/#/forgetPassword'
  const prodUrl =
    type === 'register'
      ? 'https://shopbang.cn/erp/#/register'
      : 'https://shopbang.cn/erp/#/forgetPassword'
  try {
    await shell.openExternal(env ? testUrl : prodUrl)
  } catch (error) {
    await clipboard.writeText(env ? testUrl : prodUrl)
    mainWindow.webContents.send('window-notify', { type: 'account', message: '您未设置默认浏览器，已将网址拷贝到剪切板，请手动打开浏览器访问网址。' })
  }
}

export const login = async (data: { phone: string; pwd: string }) => {
  try {
    return await request<InterfaceResult<any>, InterfaceResult<any>>({
      url: '/api/user/open/loginAutoBang',
      method: 'post',
      data,
    })
  } catch (error) {
    return {
      code: 400,
      message: error,
      data: null
    }
  }

}
export const getUserInfo = async (data: { token: string }) => {
  const res = await request<InterfaceResult<any>, InterfaceResult<any>>({
    url: '/api/user/userBase/getUserInfo',
    method: 'post',
    data,
  })
  if (res.code === 0) operationStore.set('user', res.data)

  return res
}

export const logout = async () => {
  try {
    const taskInExecution = TaskManager.getInstance()
      .getAllTasksList()
      .some((item) => item.taskStatus !== 'noExecuted')
    if (taskInExecution) await TaskManager.getInstance().stopAllTasks()
    operationStore.delete('user')
    operationStore.delete('token')
    return await request<InterfaceResult<any>, InterfaceResult<any>>({
      url: '/api/user/userBase/logoutAuto',
      method: 'post',
    })
  } catch (error) {
    return {
      code: 400,
      message: error,
      data: null,
    }
  }
}
