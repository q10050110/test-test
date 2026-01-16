import type { AppInfo } from '@/types'
import { defineStore } from 'pinia'

export const useAppStore = defineStore('app', () => {
  const appInfo = ref<AppInfo>()

  const initAppInfo = async () => {
    if (appInfo.value) return
    appInfo.value = await window.electronAPI.invoke('app', {})
  }
  initAppInfo()

  return {
    appInfo
  }
})