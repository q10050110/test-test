import type { Login } from '@/types/login'
import type { Response } from '@/types/index'
export const loginAPI = (data: Login) =>
  window.electronAPI.invoke<Response<{ token: string }>>('login', toRaw(data))

export const logoutAPI = (data: { token: string }) =>
  window.electronAPI.invoke<Response<null>>('logout', toRaw(data))
