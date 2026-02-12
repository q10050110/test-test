import { shell } from 'electron'
import request from '../utils/request.js'
import { operationStore } from '../store/index.js'
import { SysTemUtils } from '../utils/system.js'
import { InterfaceResult } from '../types/index.js'
export const accountHandle = (type: 'register' | 'resetPassword') => {
  const env = SysTemUtils.getEnv() === 'development'
  const testUrl = type === 'register' ? "https://test-plus.shopbang.cn/erp/#/register" : 'https://test-plus.shopbang.cn/erp/#/forgetPassword'
  const prodUrl = type === 'register' ? 'https://shopbang.cn/erp/#/register' : 'https://shopbang.cn/erp/#/forgetPassword'
  shell.openExternal(env ? testUrl : prodUrl)
}

export const login = async (data: {
  phone: string
  pwd: string
}) => {
  return await request<InterfaceResult<any>, InterfaceResult<any>>({
    url: '/api/user/open/loginAutoBang',
    method: 'post',
    data
  })
}
export const getUserInfo = async (data: { token: string }) => {
  const res = await request<InterfaceResult<any>, InterfaceResult<any>>({
    url: '/api/user/userBase/getUserInfo',
    method: 'post',
    data
  })
  if (res.code === 0) operationStore.set('user', res.data)

  return res
}

export const logout = async () => {
  try {
    operationStore.delete('user')
    operationStore.delete('token')
    return await request<InterfaceResult<any>, InterfaceResult<any>>({
      url: '/api/user/userBase/logoutAuto',
      method: 'post'
    })
  } catch (error) {
    return {
      code: 400,
      message: error,
      data: null
    }
  }

}