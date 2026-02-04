import { shell } from 'electron'
import { TaskManager } from '../services/collection/task-manager.services.js'
import request from '../utils/request.js'
import { operationStore } from '../store/index.js'
export const accountHandle = (type: 'register' | 'resetPassword') => {
  const env = process.env.NODE_ENV === 'development'
  const testUrl = type === 'register' ? "https://test-plus.shopbang.cn/erp/#/register" : 'https://test-plus.shopbang.cn/erp/#/forgetPassword'
  const prodUrl = type === 'register' ? 'https://shopbang.cn/erp/#/register' : 'https://shopbang.cn/erp/#/forgetPassword'
  shell.openExternal(env ? testUrl : prodUrl)
}

export const resetToken = async (data: { token: string }) => {
  const res = await request({
    url: '/api/user/userBase/getUserInfo',
    method: 'post',
    data
  })
  if (res.data) {
    operationStore.set('user', res.data)
  }
  await TaskManager.getInstance().stopAllTasks()
  return true
}