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
export const getAutoVipInfo = (data: { token?: string } = {}) =>
  request<InterfaceResult<UserVipInfo>, InterfaceResult<UserVipInfo>>({
    url: '/api/auto/autoTask/getAutoVipInfo',
    method: 'post',
    data
  })

type AccountProfile = { _id: string; pid?: string | null }

const getAccountProfile = (data: { token?: string } = {}) =>
  request<InterfaceResult<AccountProfile>, InterfaceResult<AccountProfile>>({
    url: '/api/user/userBase/getUserInfo',
    method: 'post',
    data,
  })

export const getUserInfo = async (data: { token: string }) => {
  const { token } = data
  const { code, data: profile } = await getAccountProfile(data)
  if (code !== 0 || !profile?._id) throw new Error('获取用户信息失败，请稍后重试')
  const vipInfo = await getAutoVipInfo(data)
  const user = { ...profile, ...vipInfo.data, _id: profile._id, pid: profile.pid }
  if (operationStore.get('token') === token) operationStore.set('user', user)

  return { code: 0, message: '获取用户信息成功', data: user }
}

export const logout = async (token: string) => {
  try {
    const taskInExecution = TaskManager.getInstance()
      .getAllTasksList()
      .some((item) => item.taskStatus !== 'noExecuted')
    const { TaskManager: InspectionManager } = await import('./inspection/task-manager.services.js')
    await Promise.all([
      taskInExecution ? TaskManager.getInstance().stopAllTasks() : Promise.resolve(),
      InspectionManager.getInstance().stopAllTasks(),
    ])
    operationStore.delete('user')
    operationStore.delete('token')
    return await request<InterfaceResult<any>, InterfaceResult<any>>({
      url: '/api/user/userBase/logoutAuto',
      method: 'post',
      data: { token }
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

const requestVipPurchase = async <T>(url: string, auto_vip_type: 1 | 2 | 3 | 4) => {
  try {
    const token = operationStore.get('token')
    if (!token) return { code: 401, message: '请先登录', data: null }

    const { code, data } = await getAccountProfile()
    if (token !== operationStore.get('token')) {
      return { code: 401, message: '登录状态已变更，请重新操作', data: null }
    }
    if (code !== 0 || !data?._id) throw new Error('获取用户信息失败，请稍后重试')
    if (data.pid) return { code: 403, message: '子账号无权限购买', data: null }

    return await request<InterfaceResult<T>, InterfaceResult<T>>({
      url,
      method: 'post',
      data: { auto_vip_type }
    })
  } catch (error) {
    return {
      code: 400,
      message: error instanceof Error ? error.message : String(error),
      data: null,
    }
  }
}

export const getVipPayInfo = (auto_vip_type: 1 | 2 | 3 | 4) =>
  requestVipPurchase<VipPayInfo>('/api/other/pay/autoVipPayInfo', auto_vip_type)

export const payVip = (auto_vip_type: 1 | 2 | 3 | 4) =>
  requestVipPurchase<VipResult>('/api/other/pay/autoVipPayCode', auto_vip_type)

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
export const getTodayDataCount = async () => {
  try {
    return await request<InterfaceResult<any>, InterfaceResult<any>>({
      url: '/api/auto/autoTask/getTodayDataCount',
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

export const getRecommendCategory = async () => {
  try {
    return await request<InterfaceResult<any>, InterfaceResult<any>>({
      url: '/api/auto/autoTask/getRecommendCategory',
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

export const getPieData = async () => {
  try {
    return await request<InterfaceResult<any>, InterfaceResult<any>>({
      url: '/api/goods/hotSales/ozon/getEarchData',
      method: 'post',
      data: {
        dayList: "period_week"
      }
    })
  } catch (error) {
    return {
      code: 400,
      message: error,
      data: null,
    }
  }
}
