import request from "@/utils/request";
import type { Login } from '@/types/login'
import type { Response } from '@/types/index'
export const loginAPI = (data: Login) => request<Response<{ token: string }>, Response<{ token: string }>>({
  url: '/user/open/loginAutoBang',
  method: 'post',
  data
})