import type { User } from "@/types/user";
import type { Response } from '@/types/index'

// 获取用户信息
export const getUserAPI = (data: { token: string }) => window.electronAPI.invoke<Response<User>>('getUserInfo', data)