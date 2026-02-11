import axios from "axios"
import { operationStore } from '../store/index.js'
import { globalBroadcast } from '../ipc/broadcast.js'
import log from '../log/index.js'
import { TaskManager } from '../services/collection/task-manager.services.js'
let isTokenFailure = false

const request = axios.create({
  baseURL: process.env.NODE_ENV === 'development' ? 'https://test-plus.shopbang.cn' : 'https://plus.shopbang.cn',
  timeout: 500000
})

request.interceptors.request.use(async config => {
  const token = operationStore.get('token')
  if (isTokenFailure && !config.url?.includes('getUserInfo')) return Promise.reject(new Error('token失效'))
  if (token && config.data) config.data.token = token
  // if (config.url?.includes('goodsFilter')) console.log(`URL：${config.url},请求参数:${JSON.stringify(config.data)}`)
  return config
}, error => {
  return Promise.reject(error)
})

request.interceptors.response.use(response => {
  // console.log(`URL：${response.config.url},请求结果:${JSON.stringify(response.data)}`)
  const { code, message } = response.data
  if (code !== 0) {
    log.error(`URL：${response.config.url},失败原因：${message}`)
    if (code === 401 || code === 402) {
      if (isTokenFailure) return Promise.reject(message)
      isTokenFailure = true
      globalBroadcast.broadcast('request', { code, message })
      TaskManager.getInstance().stopAllTasks()
    }
    return Promise.reject(message)
  }
  if (isTokenFailure) isTokenFailure = false
  return response.data
}, error => {
  log.error(`接口报错：${error?.message || error}`)
  return Promise.reject(error)
})

export default request