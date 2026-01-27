<script setup lang="ts">
defineProps<{
  progress?: {
    percent: number
    transferred: number
    total: number
  }
}>()

const open = ref(true)
const isUpdate = ref(false)
const updateHandle = async () => {
  isUpdate.value = true
  window.electronAPI.sendMessage('start-update-app', {})
}

const closeHandle = () => {
  open.value = false
  isUpdate.value = false
}

const openHandle = () => {
  open.value = true
}

defineExpose({
  openHandle,
  closeHandle
})
</script>

<template>
  <a-modal v-model:open="open" @cancel="open = false" style="width: 400px;" :footer="null">
    <div v-if="!isUpdate">
      <div class="c-modal">
        <div class="icon"> <img src="@/assets/window/update.png" /></div>
        <div class="title">发现新版本</div>
        <div class="version"> V1.1.0可用</div>
        <div class="desc">有新版本可用，是否立即下载更新？</div>
      </div>

      <a-row justify="center">
        <a-button type="primary" style="margin-right: 20px;" @click="updateHandle">立即更新</a-button>
        <a-button type="default" @click="open = false">稍后再说</a-button>
      </a-row>
    </div>
    <div v-else>
      <div class="update">
        <div class="loading-ring">
          <span v-for="item in 12" :key="item"></span>
        </div>
        <div class="text">正在下载更新...</div>
        <a-progress :percent="30" :size="16" strokeColor="#488dfd" />
      </div>
      <div class="progress">
        <div class="progress-text">
          <text>45%</text>
          <text>9MB/20MB</text>
        </div>
        <div>下载速度：2.MB/s</div>
      </div>
    </div>
  </a-modal>
</template>

<style lang="scss" scoped>
:deep(.ant-modal),
:deep(.ant-modal-content),
:deep(.ant-modal-body),
:deep(.ant-modal-footer),
:deep(.ant-btn),
:deep(.ant-progress) {
  -webkit-app-region: no-drag;
}

.c-modal {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  margin-bottom: 20px;
  -webkit-app-region: no-drag !important;
  z-index: 9999999999;

  .icon {
    height: 130px;
    overflow: hidden;
    display: flex;
    justify-content: center;

    img {
      height: 200px;
      width: auto;
    }
  }

  .title {
    font-size: 30px;
  }

  .version {
    font-size: 20px;
    color: #1da5ae;
    margin-bottom: 10px;
  }

  .desc {
    font-size: 14px;
    margin-bottom: 10px;
  }
}


.update {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  padding-top: 20px;

  .loading-ring {
    width: 48px;
    height: 48px;
    position: relative;

    span {
      position: absolute;
      width: 8px;
      height: 8px;
      background-color: #409eff;
      border-radius: 50%;
      top: 50%;
      left: 50%;
      transform-origin: 0 0;
      animation: fade 1.2s linear infinite;
    }
  }

  .text {
    font-size: 18px;
    margin: 20px 0 10px 0;
  }

  @for $i from 1 through 12 {
    .loading-ring span:nth-child(#{$i}) {
      transform: rotate(#{($i - 1) * 30}deg) translate(20px);
      animation-delay:#{($i - 1) * 0.1}s;
    }
  }

  @keyframes fade {
    0% {
      opacity: 1;
    }

    100% {
      opacity: 0.2;
    }
  }
}

.progress {
  margin-top: 20px;
  border-top: 1px solid #fbfbfc;
  border-bottom: 1px solid #fbfbfc;

  .progress-text {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 10px;

    text:last-child {
      color: #9e9ea9;
    }
  }
}
</style>
