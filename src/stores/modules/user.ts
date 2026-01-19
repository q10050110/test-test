import router from '@/router'
import { defineStore } from 'pinia'
import { getUserAPI } from '@/api/user'
import { logoutAPI } from '@/api/login'
import type { User } from '@/types/user'
export const useUserStore = defineStore('user', () => {
  const token = ref<string | undefined>()
  const user = ref<User>()

  const initUser = async () => {
    const data = await window.electronStore.get('user')
    if (data) return user.value = data
    await getUser()
  }
  const getUser = async () => {
    if (!token.value) return
    const { code, data } = await getUserAPI({ token: token.value })
    if (code === 0) { setUser(data) }
    return data
  }

  const setUser = async (data: User) => {
    user.value = data
    window.electronStore.set('user', data)
  }
  const setToken = async (data: string) => {
    token.value = data
    await window.electronStore.set('token', data)
  }

  const removeToken = async () => {
    token.value = undefined
    await window.electronStore.delete('token')
    user.value = undefined
    await window.electronStore.delete('user')
  }

  const getToken = async () => {
    if (token.value) return token.value
    token.value = await window.electronStore.get('token')
    return token.value
  }

  const logout = async () => {
    await logoutAPI({ token: token.value! })
    await removeToken()
    router.push(`/login?redirect=${router.currentRoute.value.path}`)
  }

  return { token, user, initUser, getUser, getToken, setToken, removeToken, logout }
})