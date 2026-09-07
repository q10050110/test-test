<script setup lang="ts">
import { useAppStore, useUserStore } from '@/stores'
const store = useAppStore()
const userStore = useUserStore()

// 退出
const clickHandle = () => {
  store.closeOpenHandle()
  store.closeType === 'quit' ? window.electronAPI.sendMessage('app-quit', '') : userStore.logout()
}
</script>

<template>
  <a-modal
    :getContainer="false"
    v-model:open="store.closeOpen"
    class="modal"
    @cancel="store.closeOpenHandle()"
    :footer="null"
    centered
    style="width: 520px"
  >
    <div class="container">
      <div class="bg"></div>
      <div class="title">
        {{ store.closeType === 'quit' ? '确定要退出软件吗?' : '确定要退出登录吗?' }}
      </div>
      <div class="desc">
        {{ store.desc }}
      </div>
      <div class="btns">
        <a-button type="primary" style="margin-right: 20px" @click="clickHandle()"
          >确认退出</a-button
        >
        <a-button @click="store.closeOpenHandle()">取消</a-button>
      </div>
    </div>
  </a-modal>
</template>

<style lang="scss" scoped>
:deep(.ant-modal-content) {
  background: url('@/assets/window/logout-bg.png');
  background-size: cover;
}
.modal {
  .container {
    height: 290px;
    padding-top: 120px;
    text-align: center;
    -webkit-app-region: no-drag !important;

    .bg {
      position: absolute;
      background: url('@/assets/window/job.png') no-repeat;
      width: 95px;
      height: 95px;
      background-size: contain;
      top: 32px;
      left: 50%;
      transform: translateX(-50%) scale(0.8);
    }

    .title {
      font-weight: 400;
      font-size: 20px;
      margin-bottom: 10px;
    }

    .desc {
      font-size: 16px;
      color: #666666;
    }
  }

  .btns {
    margin-top: 30px;
  }
}
</style>
