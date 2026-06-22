import type { AppInfo, Version } from '@/types'
import { defineStore } from 'pinia'
import type { Task } from '@/types/selectGoods'

export const useAppStore = defineStore('app', () => {
  const appInfo = ref<AppInfo>()
  const loading = ref(false)
  const closeOpen = ref(false)
  const closeType = ref<'quit' | 'logout'>('quit')
  const desc = ref('请确认是否要退出，如有选品数据未导出请先导出，退出后将无法找回。')
  const updateInfo = ref<Version>()
  const updateStatus = ref<'hasUpdate' | 'hasNew' | 'download' | 'downloaded' | 'isInstall'>(
    'hasNew',
  )
  const theme = ref({
    token: {
      fontSize: 16,
    },
  })
  const initAppInfo = async () => {
    appInfo.value = await window.electronAPI.invoke('app', {})
    if (updateStatus.value !== 'isInstall')
      updateStatus.value = (await window.electronStore.get('update-status')) || 'hasNew'
    updateInfo.value = (await window.electronStore.get('update-info')) || {}
  }

  const setLoading = (value: boolean) => (loading.value = value)

  const setTheme = (data: any) => (theme.value = data)

  const setUpdate = (value: 'hasUpdate' | 'hasNew' | 'download' | 'downloaded' | 'isInstall') =>
    (updateStatus.value = value)
  const setRootFontSize = () => {
    const baseWidth = 1300
    const baseFontSize = 16
    const width = window.innerWidth
    const scale = width / baseWidth
    const fontSize = Math.max(12, Math.min(18, baseFontSize * scale))
    console.log('fontSize', fontSize)
    setTheme({
      token: {
        fontSize: Math.max(12, fontSize),
      },
    })
    document.documentElement.style.fontSize = fontSize + 'px'
  }

  const openHandle = async (eventType: 'quit' | 'logout' = 'quit') => {
    const data = await window.electronAPI.invoke<any>('collection-get-all-tasks', {})
    const isRunning = data.some((item: Task) => item.taskStatus === 'running')
    if (isRunning) desc.value = '退出后，正在执行的任务将终止'
    closeType.value = eventType
    closeOpen.value = true
  }

  const closeOpenHandle = async () => {
    closeOpen.value = false
    desc.value = '请确认是否要退出，如有选品数据未导出请先导出，退出后将无法找回。'
  }

  return {
    appInfo,
    loading,
    theme,
    updateInfo,
    updateStatus,
    closeOpen,
    desc,
    closeType,
    setLoading,
    setTheme,
    setRootFontSize,
    setUpdate,
    initAppInfo,
    openHandle,
    closeOpenHandle,
  }
})
