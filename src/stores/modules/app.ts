import type { AppInfo } from '@/types'
import { defineStore } from 'pinia'

export const useAppStore = defineStore('app', () => {
  const appInfo = ref<AppInfo>()
  const loading = ref(false)
  const initAppInfo = async () => {
    if (appInfo.value) return
    appInfo.value = await window.electronAPI.invoke('app', {})
  }

  const setLoading = (value: boolean) => loading.value = value
  initAppInfo()

  return {
    appInfo,
    loading,
    setLoading
  }
})