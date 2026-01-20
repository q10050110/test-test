import axios from "axios"
import feedback from "./feedback"
import { useUserStore } from "@/stores"
const request = axios.create({
  baseURL: '/api', // https://test-plus.shopbang.cn
  timeout: 5000
})

request.interceptors.request.use(async config => {
  const store = useUserStore()
  const token = await store.getToken()
  if (!config.data) config.data = {}
  if (token) config.data.token = token
  return config
}, error => {
  return Promise.reject(error)
})

request.interceptors.response.use(response => {
  const store = useUserStore()
  const { code, message } = response.data
  if (code !== 0) {
    if (code === 402 || code === 401) store.logout()
    Promise.reject(new Error(message))
    feedback.error(message)
  }
  return response.data
}, error => {
  return Promise.reject(error)
})

export default request