<script setup lang="ts">
const visible = ref(false)
const loading = ref(false)
const handleCheckNetwork = async () => {
  loading.value = true
  try {
    const res = await window.electronAPI.invoke<boolean>('check-network', {})
    if (res) {
      await window.electronAPI.invoke('collection-cancel-all-task', true)
      visible.value = false
    }
  } catch (error) {}
  loading.value = false
}

const handleExportAndExit = async () => {
  // await window.electronAPI.invoke('download-all-tables', '')
  visible.value = false
  window.electronAPI.sendMessage('app-quit', '')
}

window.electronAPI.on('network-error', (data) => {
  visible.value = true
})
</script>

<template>
  <div class="network-page">
    <a-modal
      v-model:open="visible"
      :closable="false"
      :maskClosable="false"
      :footer="null"
      width="500"
      centered
    >
      <div class="network-error">
        <div class="network-error__icon">🌐</div>

        <div class="network-error__title">网络连接异常</div>

        <div class="network-error__desc">
          当前网络连接已中断，任务无法继续执行。
          <br />
          您可以尝试重新检测网络或退出程序。
        </div>

        <div class="network-error__actions">
          <a-button @click="handleCheckNetwork" :loading="loading"> 检测网络 </a-button>
          <a-button type="primary" @click="handleExportAndExit"> 退出 </a-button>
        </div>
      </div>
    </a-modal>
  </div>
</template>

<style lang="scss" scoped>
.network-error {
  padding: 12px 8px;
  text-align: center;
  -webkit-app-region: no-drag !important;
  &__icon {
    font-size: 56px;
    margin-bottom: 16px;
  }

  &__title {
    font-size: 22px;
    font-weight: 600;
    color: #1f2329;
    margin-bottom: 12px;
  }

  &__desc {
    font-size: 14px;
    color: #646a73;
    line-height: 24px;
    margin-bottom: 32px;
  }

  &__actions {
    display: flex;
    justify-content: center;
    gap: 12px;

    :deep(.ant-btn) {
      min-width: 140px;
    }
  }
}
</style>
