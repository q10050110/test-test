<script setup lang="ts">
import zhCN from 'ant-design-vue/es/locale/zh_CN'
import { useAppStore, useUserStore } from './stores'
import feedback from './utils/feedback'
import { debounce } from 'lodash'
import type CModal from './components/c-modal.vue'
import type { Progress } from './types'
import dingMp3 from '@/assets/window/ding.mp3'
import notify from './utils/notify'
const store = useUserStore()
const appStore = useAppStore()
const cModalRef = ref<InstanceType<typeof CModal>>()

const progress = ref<Progress>({
  percent: 0,
  total: '0',
  speed: '0',
  downloaded: '0',
})
window.electronAPI.on('request', (data) => {
  feedback.error(data.message)
  store.logout()
})

window.electronAPI.on('task-completed', (data) => {
  feedback.notify(data.message, 'success')
  const audio = new Audio(dingMp3)
  audio.play()
})

window.electronAPI.on('app-ready-quit', () => {
  console.log('准备退出啦~~~')
  appStore.setLoading(true)
})

window.electronAPI.on('update-checking', async () => {
  console.log('检测更新啦~~')
})

window.electronAPI.on('update-available', async () => {
  console.log('发现新版本啦~~')
  await nextTick()
  if (appStore.updateStatus !== 'isInstall') await appStore.initAppInfo()
  if (appStore.updateStatus !== 'downloaded' && appStore.updateStatus !== 'isInstall')
    appStore.setUpdate('hasUpdate')
  if (appStore.updateStatus !== 'isInstall') cModalRef.value && cModalRef.value.openHandle()
})

window.electronAPI.on('update-not-available', () => {
  appStore.setUpdate('hasNew')
  console.log('已经是最新版本啦~~')
})

window.electronAPI.on('update-download-progress', (data: Progress) => {
  progress.value = data
})

window.electronAPI.on('update-downloaded', async () => {
  console.log('更新完成啦~~')
  await nextTick()
  if (appStore.updateStatus !== 'isInstall') {
    appStore.setUpdate('downloaded')
    cModalRef.value && cModalRef.value.openHandle()
  }
})

window.electronAPI.on('update-error', async (error) => {
  await nextTick()
  appStore.setUpdate('hasUpdate')
  cModalRef.value && cModalRef.value?.closeHandle()
})

window.electronAPI.on('window-close', () => {
  console.log('关闭窗口了')
  appStore.openHandle('quit')
})

window.electronAPI.on('window-notify', (data: { message: string; type: keyof typeof notify }) => {
  notify[data.type].callback(data.message)
})

const onResize = debounce(() => {
  appStore.setRootFontSize()
}, 100)

window.addEventListener('resize', onResize)

onMounted(async () => {
  await nextTick()
  await appStore.initAppInfo()
  window.electronAPI.sendMessage('check-update-app', '')
})
</script>

<template>
  <a-config-provider :locale="zhCN" :theme="appStore.theme">
    <router-view v-if="!appStore.loading" />
    <c-loading v-else />
    <c-modal ref="cModalRef" :progress="progress" v-if="!appStore.loading" />
    <c-close-modal v-if="!appStore.loading" />
    <c-network-modal v-if="!appStore.loading" />
  </a-config-provider>
</template>

<style scoped lang="scss"></style>
