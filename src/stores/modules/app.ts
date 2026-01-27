import type { AppInfo } from '@/types'
import { defineStore } from 'pinia'

export const useAppStore = defineStore('app', () => {
  const appInfo = ref<AppInfo>()
  const loading = ref(false)

  const theme = ref({
    token: {
      fontSize: 16
    }
  })
  const initAppInfo = async () => {
    if (appInfo.value) return
    appInfo.value = await window.electronAPI.invoke('app', {})
  }

  const setLoading = (value: boolean) => loading.value = value
  initAppInfo()

  const setTheme = (data: any) => theme.value = data


  const setRootFontSize = () => {
    const baseWidth = 1300
    const baseFontSize = 16
    const width = window.innerWidth
    const scale = width / baseWidth
    const fontSize = Math.max(12, Math.min(18, baseFontSize * scale))
    console.log('fontSize', fontSize)
    setTheme({
      token: {
        fontSize: Math.max(12, fontSize)
      }
    })
    document.documentElement.style.fontSize = fontSize + 'px'
  }
  return {
    appInfo,
    loading,
    theme,
    setLoading,
    setTheme,
    setRootFontSize
  }
})