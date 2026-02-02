<script setup lang="ts">
import zhCN from 'ant-design-vue/es/locale/zh_CN'
import { useAppStore, useUserStore } from './stores'
import feedback from './utils/feedback'
import { debounce } from 'lodash'
import type CModal from './components/c-modal.vue'
import type CCloseModal from './components/c-close-modal.vue'
import type { Progress, Version } from './types'

const store = useUserStore()
const appStore = useAppStore()
const cModalRef = ref<InstanceType<typeof CModal>>()
const cCloseModalRef = ref<InstanceType<typeof CCloseModal>>()
const isCheckUpdate = ref(false)
const version = ref<Version>({
  version: '未知',
  size: 0,
  releaseDate: '未知'
})
const progress = ref<Progress>({
  percent: 0,
  total: '0',
  speed: '0',
  downloaded: '0'
})
window.electronAPI.on('request', (data) => {
  feedback.error(data.message)
  store.logout()
})

window.electronAPI.on('app-ready-quit', () => {
  console.log('准备退出啦~~~')
  appStore.setLoading(true)
})

window.electronAPI.on('checking-for-update', () => {
  isCheckUpdate.value = true
  console.log('检测更新啦~~')
})

window.electronAPI.on('update-available', async (info: Version) => {
  console.log('发现新版本啦~~')
  await nextTick()
  appStore.setUpdate(true)
  if (info?.version) version.value = info
  cModalRef.value && cModalRef.value.openHandle()
})

window.electronAPI.on('update-not-available', () => {
  feedback.success('当前版本已经是最新的啦~~~')
  console.log('已经是最新版本啦~~')
})

window.electronAPI.on('update-download-progress', (data: Progress) => {
  progress.value = data
})

window.electronAPI.on('update-downloaded', async () => {
  console.log('更新完成啦~~')
  await nextTick()
  cModalRef.value && cModalRef.value.changeStatus('isInstall')
  cModalRef.value && cModalRef.value.openHandle()
})

window.electronAPI.on('update-error', async (error) => {
  console.log('更新失败啦~~')
  await nextTick()
  cModalRef.value && cModalRef.value?.closeHandle()
})


window.electronAPI.on('window-close', () => {
  console.log('关闭窗口了')
  cCloseModalRef.value && cCloseModalRef.value.openHandle()
})

const onResize = debounce(() => {
  appStore.setRootFontSize()
}, 100)

window.addEventListener('resize', onResize)

onMounted(() => {
  if (!isCheckUpdate.value) window.electronAPI.sendMessage('check-update-app', '')
  if (appStore.isUpdate) cModalRef.value?.openHandle()
})

</script>

<template>
  <a-config-provider :locale="zhCN" :theme="appStore.theme">
    <router-view v-if="!appStore.loading" />
    <c-loading v-else />
    <c-modal ref="cModalRef" :version="version" :progress="progress" />
    <c-close-modal ref="cCloseModalRef" />
  </a-config-provider>
</template>

<style scoped lang="scss"></style>
