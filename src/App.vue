<script setup lang="ts">
import zhCN from 'ant-design-vue/es/locale/zh_CN'
import { useAppStore, useUserStore } from './stores'
import feedback from './utils/feedback'

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
</script>

<template>
  <a-config-provider :locale="zhCN">
    <router-view v-if="!appStore.loading" />
    <c-loading v-else />
  </a-config-provider>
</template>

<style scoped lang="scss"></style>
