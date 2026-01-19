import axios from "axios"
import { operationStore } from '../store/index.js'
const request = axios.create({
  baseURL: process.env.NODE_ENV === 'development' ? 'https://test-plus.shopbang.cn' : '/api', // https://test-plus.shopbang.cn
  timeout: 5000
})

request.interceptors.request.use(async config => {
  const token = operationStore.get('token')
  if (token) config.data.token = token
  console.log(`URL：${config.url},请求参数:${JSON.stringify(config.data)}`)
  return config
}, error => {
  return Promise.reject(error)
})

request.interceptors.response.use(response => {
  console.log(`URL：${response.config.url},请求结果:${JSON.stringify(response.data)}`)
  const { code, message } = response.data
  if (code !== 0) return Promise.reject(message)
  return response.data
}, error => {
  return Promise.reject(error)
})

export default request