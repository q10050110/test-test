import type { User } from "@/types/user";
import request from "@/utils/request";
import type { Response } from '@/types/index'

// 获取用户信息
export const getUserAPI = (data: { token: string }) => request<Response<User>, Response<User>>({
  url: '/user/userBase/getUserInfo',
  method: 'post',
  data
})