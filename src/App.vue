<script setup lang="ts">
import zhCN from 'ant-design-vue/es/locale/zh_CN'
import { useUserStore } from './stores'
import feedback from './utils/feedback'

const store = useUserStore()
window.electronAPI.on('request', (data) => {
  feedback.error(data.message)
  store.logout()
})
</script>

<template>
  <a-config-provider :locale="zhCN">
    <router-view />
  </a-config-provider>
</template>

<style scoped lang="scss"></style>
