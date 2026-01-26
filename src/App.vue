<script setup lang="ts">
import zhCN from 'ant-design-vue/es/locale/zh_CN'
import { useAppStore, useUserStore } from './stores'
import feedback from './utils/feedback'
import { debounce } from 'lodash'
import type CModal from './components/c-modal.vue'

const store = useUserStore()
const appStore = useAppStore()
const cModalRef = ref<InstanceType<typeof CModal>>()
window.electronAPI.on('request', (data) => {
  feedback.error(data.message)
  store.logout()
})

window.electronAPI.on('app-ready-quit', () => {
  console.log('准备退出啦~~~')
  appStore.setLoading(true)
})

window.electronAPI.on('checking-for-update', () => {
  console.log('检测更新啦~~')
})

window.electronAPI.on('update-available', async () => {
  console.log('发现新版本啦~~')
  await nextTick()
  cModalRef.value && cModalRef.value.openHandle()
})

window.electronAPI.on('update-not-available', () => {
  feedback.success('当前版本已经是最新的啦~~~')
  console.log('已经是最新版本啦~~')
})

window.electronAPI.on('update-downloaded', async () => {
  console.log('更新完成啦~~')
  await nextTick()
  cModalRef.value && cModalRef.value?.closeHandle()
})

window.electronAPI.on('update-error', async (error) => {
  console.log('更新失败啦~~')
  await nextTick()
  cModalRef.value && cModalRef.value?.closeHandle()
})
const setRootFontSize = () => {
  const baseWidth = 1300
  const baseFontSize = 16
  const width = window.innerWidth
  const scale = width / baseWidth
  const fontSize = Math.max(12, Math.min(20, baseFontSize * scale))
  console.log('font-size', fontSize)
  document.documentElement.style.fontSize = fontSize + 'px'
}

const onResize = debounce(() => {
  setRootFontSize()
}, 100)

window.addEventListener('resize', onResize)
</script>

<template>
  <a-config-provider :locale="zhCN">
    <router-view v-if="!appStore.loading" />
    <c-loading v-else />
    <c-modal />
  </a-config-provider>
</template>

<style scoped lang="scss"></style>
