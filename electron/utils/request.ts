import axios from "axios"
import { operationStore } from '../store/index.js'
import { globalBroadcast } from '../ipc/broadcast.js'
import log from '../log/index.js'
const request = axios.create({
  baseURL: process.env.NODE_ENV === 'development' ? 'https://test-plus.shopbang.cn' : 'https://test-plus.shopbang.cn',
  timeout: 500000
})

request.interceptors.request.use(async config => {
  const token = operationStore.get('token')
  if (token && config.data) config.data.token = token
  // console.log(`URL：${config.url},请求参数:${JSON.stringify(config.data)}`)
  return config
}, error => {
  return Promise.reject(error)
})

request.interceptors.response.use(response => {
  // console.log(`URL：${response.config.url},请求结果:${JSON.stringify(response.data)}`)
  const { code, message } = response.data
  if (code !== 0) {
    log.error(`URL：${response.config.url},失败原因：${message}`)
    if (code === 401 || code === 402) globalBroadcast.broadcast('request', { code, message })
    return Promise.reject(message)
  }
  return response.data
}, error => {
  log.error(`接口报错：${error}`)
  return Promise.reject(error)
})

export default request