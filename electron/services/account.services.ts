import { shell, clipboard, BrowserWindow } from 'electron'
import request from '../utils/request.js'
import { operationStore } from '../store/index.js'
import { SysTemUtils } from '../utils/system.js'
import { InterfaceResult } from '../types/index.js'
import { TaskManager } from './collection/task-manager.services.js'
import { VipInfo, UserVipInfo, VipPayInfo, VipResult, VipPayResult } from '../types/user'
export const accountHandle = async (
  type: 'register' | 'resetPassword',
  mainWindow: BrowserWindow,
) => {
  const env = SysTemUtils.getEnv() === 'development'
  const testUrl =
    type === 'register'
      ? 'https://test-ozon.shopbang.cn/#/register'
      : 'https://test-ozon.shopbang.cn/#/forgetPassword'
  const prodUrl =
    type === 'register'
      ? 'https://ozon.shopbang.cn/#/register'
      : 'https://ozon.shopbang.cn/#/forgetPassword'
  try {
    await shell.openExternal(env ? testUrl : prodUrl)
  } catch (error) {
    await clipboard.writeText(env ? testUrl : prodUrl)
    mainWindow.webContents.send('window-notify', {
      type: 'account',
      message: '您未设置默认浏览器，已将网址拷贝到剪切板，请手动打开浏览器访问网址。',
    })
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
      data: null,
    }
  }
}
export const getUserInfo = async (data: { token: string }) => {
  const res = await request<InterfaceResult<any>, InterfaceResult<any>>({
    url: '/api/user/userBase/getUserInfo',
    method: 'post',
    data,
  })
  const vipInfo = await request<InterfaceResult<UserVipInfo>, InterfaceResult<UserVipInfo>>({
    url: '/api/auto/autoTask/getAutoVipInfo',
    method: 'post',
    data
  })
  if (res.code === 0) operationStore.set('user', { ...res.data, ...vipInfo.data })

  return { code: 0, message: '获取用户信息成功', data: { ...res.data, ...vipInfo.data } }
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

export const getVipInfo = async () => {
  try {
    return await request<InterfaceResult<VipInfo[]>, InterfaceResult<VipInfo[]>>({
      url: '/api/auto/autoTask/getVipPrices',
      method: 'post',
      data: {}
    })
  } catch (error) {
    return {
      code: 400,
      message: error,
      data: null,
    }
  }
}

export const getVipPayInfo = async (auto_vip_type: 1 | 2 | 3 | 4) => {
  try {
    return await request<InterfaceResult<VipPayInfo>, InterfaceResult<VipPayInfo>>({
      url: '/api/other/pay/autoVipPayInfo',
      method: 'post',
      data: { auto_vip_type }
    })
  } catch (error) {
    return {
      code: 400,
      message: error,
      data: null,
    }
  }
}

export const payVip = async (auto_vip_type: 1 | 2 | 3 | 4) => {
  try {
    return await request<InterfaceResult<VipResult>, InterfaceResult<VipResult>>({
      url: '/api/other/pay/autoVipPayCode',
      method: 'post',
      data: { auto_vip_type }
    })
  } catch (error) {
    return {
      code: 400,
      message: error,
      data: null,
    }
  }
}

export const getVipPayResult = async (mchOrderNo: string) => {
  try {
    return await request<InterfaceResult<VipPayResult>, InterfaceResult<VipPayResult>>({
      url: '/api/other/pay/getPayResult',
      method: 'post',
      data: { mchOrderNo }
    })
  } catch (error) {
    return {
      code: 400,
      message: error,
      data: null,
    }
  }
}