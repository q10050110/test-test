<script setup lang="ts">
import type { Task } from '@/types/selectGoods'
const open = ref(false)
const desc = ref('真的真的要退出吗T_T？')
const route = useRoute()
const openHandle = async () => {
  const isLogin = route.fullPath.includes('/login')
  if (!isLogin) {
    const data = await window.electronAPI.invoke('collection-get-all-tasks', {})
    const isRunning = data.some((item: Task) => item.taskStatus === 'running')
    if (isRunning) desc.value = '现在退出的话，正在进行的任务会中断哦～'
  }
  open.value = true
}

const cancelHandle = () => {
  open.value = false
  desc.value = '真的真的要退出吗T_T？'
}

// 退出
const clickHandle = () => {
  cancelHandle()
  window.electronAPI.sendMessage('app-quit', '')
}

defineExpose({
  openHandle,
  cancelHandle
})
</script>

<template>
  <a-modal v-model:open="open" @cancel="cancelHandle" class="modal" :footer="null" style="width: 400px;">
    <div class="container">
      <div class="bg"></div>
      <div class="title">要退出吗？</div>
      <div class="desc">
        {{ desc }}
      </div>
      <div class="btns">
        <a-button type="primary" style="margin-right: 20px;" @click="clickHandle()">确认退出</a-button>
        <a-button @click="cancelHandle">取消</a-button>
      </div>
    </div>
  </a-modal>
</template>

<style lang="scss" scoped>
.modal {
  .container {
    position: relative;
    height: 200px;
    padding-top: 70px;
    text-align: center;
    -webkit-app-region: no-drag !important;

    .bg {
      position: absolute;
      background: url('@/assets/window/bg.png') no-repeat;
      inset: 0;
      background-size: contain;
      top: -84px;
      clip-path: inset(0 0 146px 0);
      transform: scale(1.1);
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
