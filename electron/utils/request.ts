import axios from 'axios'
import { operationStore } from '../store/index.js'
import { globalBroadcast } from '../ipc/broadcast.js'
import log from '../log/index.js'
import { TaskManager } from '../services/collection/task-manager.services.js'
import { SysTemUtils } from './system.js'
import { app } from 'electron'
let isTokenFailure = false

const request = axios.create({
  baseURL:
    SysTemUtils.getEnv() === 'development'
      ? 'https://test-plus.shopbang.cn'
      : 'https://plus.shopbang.cn',
  timeout: 10000,
})

request.interceptors.request.use(
  async (config) => {
    const token = operationStore.get('token')
    if (isTokenFailure && !config.url?.includes('login'))
      return Promise.reject(new Error('token失效'))
    if (token && config.data) config.data.token = token
    if (config.data) {
      config.data.pluginVersion = "3.2.7"
      config.data.autoVersion = app?.getVersion()
      config.data.from_type = 'auto'
    }
    // console.log(`URL：${config.url},请求参数:${JSON.stringify(config.data)}`)
    return config
  },
  (error) => {
    return Promise.reject(error)
  },
)

request.interceptors.response.use(
  (response) => {
    // console.log(`URL：${response.config.url},请求结果:${JSON.stringify(response.data)}`)
    const { code, message } = response.data
    if (code !== 0) {
      log.error(`URL：${response.config.url},失败原因：${message}`)
      if (code === 401 || code === 402) {
        if (isTokenFailure) return Promise.reject(message)
        isTokenFailure = true
        operationStore.set('expired', true)
        globalBroadcast.broadcast('request', { code, message })
        TaskManager.getInstance().stopAllTasks()
      }
      return Promise.reject(message)
    }
    if (isTokenFailure) {
      isTokenFailure = false
      operationStore.set('expired', false)
    }
    return response.data
  },
  (error) => {
    log.error(`${error?.config?.url || error}接口报错：${error?.config?.message || error}`)
    if (error.code === 'ENOTFOUND') {
      globalBroadcast.broadcast('network-error', { code: error.code, message: '当前网络不可用' })
      return Promise.reject('当前网络不可用')
    }
    return Promise.reject(error)
  },
)

export const downloadFile = async (params: { url: string; method: 'get' | 'post' }) => {
  const { url, method } = params
  const token = operationStore.get('token')
  const prefix =
    SysTemUtils.getEnv() === 'development'
      ? 'https://test-plus.shopbang.cn'
      : 'https://plus.shopbang.cn'
  return axios({
    url: url.startsWith('https') ? url : `${prefix}${url}`,
    method,
    headers: {
      'Content-Type': 'application/json',
      token,
    },
  })
}

export default request
