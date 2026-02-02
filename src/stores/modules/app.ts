import type { AppInfo, Version } from '@/types'
import { defineStore } from 'pinia'


export const useAppStore = defineStore('app', () => {
  const appInfo = ref<AppInfo>()
  const loading = ref(false)
  const updateInfo = ref<Version>()
  const updateStatus = ref<'hasUpdate' | 'hasNew' | 'download' | 'downloaded' | 'isInstall'>('hasNew')
  const theme = ref({
    token: {
      fontSize: 16
    }
  })
  const initAppInfo = async () => {
    if (appInfo.value) return
    appInfo.value = await window.electronAPI.invoke('app', {})
    updateStatus.value = await window.electronStore.get('update-status') || 'hasNew'
    updateInfo.value = await window.electronStore.get('update-info') || {}
  }

  const setLoading = (value: boolean) => loading.value = value


  const setTheme = (data: any) => theme.value = data

  const setUpdate = (value: 'hasUpdate' | 'hasNew' | 'download' | 'downloaded' | 'isInstall') => updateStatus.value = value
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
    updateInfo,
    updateStatus,
    setLoading,
    setTheme,
    setRootFontSize,
    setUpdate,
    initAppInfo
  }
})