<script setup lang="ts">
import { useAppStore } from '@/stores'
import type { Progress } from '@/types'
import dayjs from 'dayjs'
defineProps<{
  progress?: Progress
}>()

const config = ref<{
  feature: string[]
  optimize: string[]
  repair: string[]
}>({
  feature: [],
  optimize: [],
  repair: [],
})
const store = useAppStore()
const open = ref(false)
const updateHandle = async () => {
  store.setUpdate('download')
  window.electronAPI.sendMessage('start-update-app', {})
}
const installHandle = async () => {
  store.setUpdate('isInstall')
  await setTimeout(() => {
    window.electronAPI.sendMessage('quit-and-install-app', {})
  }, 500)
}
const closeHandle = () => {
  open.value = false
}

const openHandle = () => {
  open.value = true
}

const formatDate = (date: string) => dayjs(date).format('YYYY-MM-DD HH:mm:ss')

const formatSize = (size: number) => {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024
    i++
  }
  return `${size.toFixed(2)} ${units[i]}`
}

const getConfig = async () => {
  const {
    feature = [],
    optimize = [],
    repair = [],
  } = await window.electronAPI.invoke<{ feature: string[]; optimize: string[]; repair: string[] }>(
    'get-config',
    '',
  )
  config.value = {
    feature,
    optimize,
    repair,
  }
}
getConfig()
defineExpose({
  openHandle,
  closeHandle,
})
</script>

<template>
  <a-modal
    v-model:open="open"
    @cancel="open = false"
    :style="{ width: store.updateStatus === 'hasUpdate' ? '867px' : '400px' }"
    :footer="null"
  >
    <div class="update-tips" v-if="store.updateStatus === 'hasUpdate'">
      <img src="@/assets/window/new-version.png" alt="" class="bg" />
      <div class="title">
        <div>发现最新版本 for Windows V{{ store.updateInfo?.version }}</div>
        <div>当前版本 V{{ store.appInfo?.version }}</div>
      </div>
      <div class="content">
        <div class="content-title">版本更新说明</div>
        <div class="content-desc">
          <div class="u-item" v-if="config.feature.length">
            <p v-for="(item, i) in config.feature" :key="i">{{ i + 1 }}.{{ item }}</p>
          </div>
        </div>
      </div>

      <a-row justify="center" class="btns">
        <a-button type="primary" style="margin-right: 20px" @click="updateHandle"
          >立即更新</a-button
        >
        <a-button type="default" @click="open = false">稍后再说</a-button>
      </a-row>
    </div>
    <div v-if="store.updateStatus === 'download'">
      <div class="update">
        <div class="loading-ring">
          <span v-for="item in 12" :key="item"></span>
        </div>
        <div class="text">正在下载更新...</div>
        <a-progress :percent="progress?.percent" :size="16" strokeColor="#488dfd" />
      </div>
      <div class="progress">
        <div class="progress-text">
          <text>{{ progress?.percent }}%</text>
          <text>{{ progress?.downloaded }}MB/{{ progress?.total }}MB</text>
        </div>
        <div>下载速度：{{ progress?.speed }}MB/s</div>
      </div>
    </div>
    <div class="download-completed" v-if="store.updateStatus === 'downloaded'">
      <img
        src="@/assets/window/download-completed.png"
        alt=""
        style="margin-bottom: 20px"
        class="d-bg"
      />
      <a-row justify="center" class="d-btns">
        <a-button type="primary" style="margin-right: 20px" @click="installHandle"
          >立即安装</a-button
        >
        <a-button type="default" @click="open = false">稍后再说</a-button>
      </a-row>
    </div>
    <div v-if="store.updateStatus === 'isInstall'" class="installing">
      <div class="install-title">正在安装更新</div>
      <div class="install-desc">
        更新已下载完成，应用将自动重启<br />
        请勿关闭窗口
      </div>

      <div class="install-tip">
        <span class="dot"></span>
        正在替换程序文件…
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

.update-tips {
  .bg {
    position: absolute;
    inset: 0;
    top: 0;
    left: 0;
  }

  .title {
    position: absolute;
    top: 40px;
    left: 40px;
    div {
      width: 100vw;
      &:first-child {
        color: #333;
        font-size: 22px;
        font-weight: 600;
        margin-bottom: 12px;
      }
      &:last-child {
        font-size: 16px;
        color: #666666;
      }
    }
  }

  .content {
    position: absolute;
    top: 142px;
    left: 49px;
    &-title {
      font-weight: 600;
      font-size: 18px;
      color: #333333;
      margin-bottom: 8px;
    }
    &-desc {
      width: 320px;
      height: 145px;
      overflow-y: auto;
    }
  }

  .btns {
    position: absolute;
    left: 42px;
    top: 393px;
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
      animation-delay: #{($i - 1) * 0.1}s;
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

.installing {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 30px 0 10px;

  .install-title {
    font-size: 18px;
    font-weight: 600;
    margin-bottom: 6px;
  }

  .install-desc {
    font-size: 14px;
    color: #606266;
    text-align: center;
    line-height: 1.6;
  }

  .install-tip {
    margin-top: 20px;
    font-size: 13px;
    color: #909399;
    display: flex;
    align-items: center;

    .dot {
      width: 6px;
      height: 6px;
      background: #488dfd;
      border-radius: 50%;
      margin-right: 8px;
      animation: blink 1.2s infinite;
    }
  }
}

@keyframes blink {
  0%,
  100% {
    opacity: 0.2;
  }

  50% {
    opacity: 1;
  }
}

.u-item {
  p {
    font-size: 16px;
    color: #333333;
  }
}

.download-completed {
  .d-bg {
    position: absolute;
    left: 0;
    top: 0;
    background-size: contain;
  }

  .d-btns {
    width: 100vw;
    position: absolute;
    top: 176px;
    left: 50%;
    transform: translateX(-50%);
  }
}
</style>
