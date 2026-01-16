import router from '@/router'
import { defineStore } from 'pinia'

export const useUserStore = defineStore('user', () => {
  const token = ref<string | undefined>()
  const setToken = async (data: string) => {
    token.value = data
    await window.electronStore.set('token', data)
  }

  const removeToken = async () => {
    token.value = undefined
    await window.electronStore.delete('token')
  }

  const getToken = async () => {
    if (token.value) return token.value
    token.value = await window.electronStore.get('token')
    return token.value
  }

  const logout = async () => {
    await removeToken()
    router.push(`/login?redirect=${router.currentRoute.value.path}`)
  }

  return { token, getToken, setToken, removeToken, logout }
})