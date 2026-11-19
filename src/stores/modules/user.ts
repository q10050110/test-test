import router from '@/router'
import { defineStore } from 'pinia'
import { getUserAPI } from '@/api/user'
import { logoutAPI } from '@/api/login'
import type { User } from '@/types/user'
import feedback from '@/utils/feedback'
export const useUserStore = defineStore('user', () => {
  const token = ref<string | undefined>()
  const user = ref<User>()
  const isSubAccount = computed(() => Boolean(user.value?.pid))
  const hasShowVipModal = ref(false)

  const initUser = async () => {
    const cachedUser = await window.electronStore.get('user')
    if (cachedUser) user.value = cachedUser
    try {
      await getUser()
    } catch (error) {
      if (!cachedUser) throw error
    }
  }
  const getUser = async () => {
    const currentToken = token.value
    if (!currentToken) return
    const { code, data } = await getUserAPI({ token: currentToken })
    if (token.value !== currentToken) return
    if (code === 0) user.value = data
    return data
  }

  const setToken = async (data: string) => {
    token.value = data
    await window.electronStore.set('token', data)
  }

  const removeToken = async () => {
    token.value = undefined
    user.value = undefined
    hasShowVipModal.value = false
  }

  const getToken = async () => {
    if (token.value) return token.value
    token.value = await window.electronStore.get('token')
    return token.value
  }

  const logout = async () => {
    try {
      await logoutAPI({ token: token.value! })
      router.push(`/login?redirect=${router.currentRoute.value.path}`)
      await removeToken()
    } catch (error) {
      console.log(error)
    } finally {
    }
  }

  const checkVipPurchase = () => {
    if (!isSubAccount.value) return true
    feedback.warning('子账号无权限购买')
    return false
  }

  const setShowVipModal = (show: boolean) => {
    if (show && !checkVipPurchase()) return
    hasShowVipModal.value = show
  }

  return { token, user, hasShowVipModal, initUser, getUser, getToken, setToken, removeToken, logout, checkVipPurchase, setShowVipModal }
})
