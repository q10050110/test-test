import axios from "axios"
import feedback from "./feedback"
import { useUserStore } from "@/stores"
const request = axios.create({
  baseURL: import.meta.env.VITE_APP_BASE_URL,
  timeout: 5000
})

request.interceptors.request.use(async config => {
  const store = useUserStore()
  const token = await store.getToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
}, error => {
  return Promise.reject(error)
})

request.interceptors.response.use(response => {
  const { code, message } = response.data
  if (code !== 0) {
    Promise.reject(new Error(message))
    feedback.error(message)
  }
  return response.data
}, error => {
  return Promise.reject(error)
})

export default request