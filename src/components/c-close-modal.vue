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
    v-model:open="store.closeOpen"
    @cancel="store.closeOpenHandle()"
    class="modal"
    :footer="null"
    centered
    style="width: 400px"
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
.modal {
  .container {
    position: relative;
    height: 200px;
    padding-top: 60px;
    text-align: center;
    -webkit-app-region: no-drag !important;

    .bg {
      position: absolute;
      background: url('@/assets/window/bg2.png') no-repeat;
      background-size: contain;
      inset: 0;
      top: -120px;
      left: 50%;
      transform: translateX(-50%);
    }

    .title {
      font-weight: 700;
      font-size: 20px;
      margin-bottom: 10px;
    }
  }

  .btns {
    margin-top: 30px;
  }
}
</style>
