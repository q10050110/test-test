<script setup lang="ts">
import { useAppStore } from '@/stores';
import suofang from '@/assets/window/suofang.png'
import fangda from '@/assets/window/fangda.png'
const store = useAppStore()

const isMax = ref(false)

// 隐藏&放大&关闭
const operationHandle = (type: 'hide' | 'close' | 'maximize' | 'minimize') => {
  if (type === 'maximize' || type === 'minimize') isMax.value = !isMax.value
  window.electronAPI.sendMessage('window', type)
}
</script>

<template>
  <div class="header-page">
    <div class="left">
      <img src="@/assets/login/logo.png" alt="">
      <span class="version">V{{ store.appInfo?.version }}</span>
      <a-button type="primary">检测更新</a-button>
    </div>
    <div class="right">
      <div class="customer-service">
        <img src="@/assets/window/lianxikefu.png" alt="">
        联系客服
      </div>
      <div class="operations">
        <img src="@/assets/window/suoxiao.png" alt="" @click="operationHandle('hide')">
        <img :src="isMax ? suofang : fangda" alt="" @click="
          operationHandle(isMax ? 'minimize' : 'maximize')">
        <img src="@/assets/window/guanbi.png" alt="" @click="operationHandle('close')">
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.header-page {
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 100%;
  padding: 0 30px 0 20px;

  .left {
    flex: 1;
    display: flex;
    align-items: center;

    img {
      height: 30px;
      object-fit: contain;
    }

    .version {
      margin: 0 10px;
    }
  }

  .right {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    flex: 1;

    img {
      width: 20px;
      object-fit: contain;
      vertical-align: middle;
    }

    .customer-service {
      margin-right: 20px;
    }

    .operations {
      img:nth-child(2) {
        margin: 0 10px;
      }
    }
  }
}
</style>
