<script setup lang="ts">
import zhCN from 'ant-design-vue/es/locale/zh_CN'
import { useAppStore, useUserStore } from './stores'
import feedback from './utils/feedback'
import { debounce } from 'lodash'
const store = useUserStore()
const appStore = useAppStore()
window.electronAPI.on('request', (data) => {
  feedback.error(data.message)
  store.logout()
})

window.electronAPI.on('app-ready-quit', () => {
  console.log('准备退出啦~~~')
  appStore.setLoading(true)
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
  </a-config-provider>
</template>

<style scoped lang="scss"></style>
