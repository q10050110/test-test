<script setup lang="ts">
import { useAppStore } from '@/stores'
import type { Progress } from '@/types'
import config from '../../electron/config/index'
import dayjs from 'dayjs'
defineProps<{
  progress?: Progress
}>()

const store = useAppStore()
const open = ref(false)
const showUpdateDialog = ref(false)
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

defineExpose({
  openHandle,
  closeHandle,
})
</script>

<template>
  <a-modal v-model:open="open" @cancel="open = false" style="width: 400px" :footer="null">
    <div v-if="store.updateStatus === 'hasUpdate'">
      <div class="c-modal">
        <div class="icon"><img src="@/assets/window/update.png" /></div>
        <div class="title">发现新版本</div>
        <div class="version">
          <div>V{{ store.updateInfo?.version }}可用</div>
          <div>{{ formatSize(store.updateInfo?.size || 0) }}</div>
          <div>{{ formatDate(store.updateInfo?.date || '') }}发布</div>
        </div>
        <div class="desc">
          有新版本可用，是否立即下载更新？<span
            style="cursor: pointer; color: #1a6be8"
            @click="showUpdateDialog = true"
            >查看更新</span
          >
        </div>
      </div>

      <a-row justify="center">
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
    <div v-if="store.updateStatus === 'downloaded'">
      <img src="@/assets/window/download.png" alt="" style="margin-bottom: 20px" />
      <a-row justify="center">
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
  <a-modal
    v-model:open="showUpdateDialog"
    title="更新内容"
    :footer="null"
    @cancel="showUpdateDialog = false"
    style="width: 400px; -webkit-app-region: no-drag"
  >
    <div class="u-item" v-if="config.feature.length">
      <div class="title">
        <img src="@/assets/layout/feature.png" alt="" class="u-icon" />
        新功能
      </div>
      <ul class="desc">
        <li v-for="(item, i) in config.feature" :key="i">
          {{ item }}
        </li>
      </ul>
    </div>
    <div class="u-item" v-if="config.optimize.length">
      <div class="title">
        <img src="@/assets/layout/optimize.png" alt="" class="u-icon" />
        优化
      </div>
      <ul class="desc">
        <li v-for="(item, i) in config.optimize" :key="i">
          {{ item }}
        </li>
      </ul>
    </div>
    <div class="u-item">
      <div class="title">
        <img src="@/assets/layout/bug.png" alt="" class="u-icon" />
        修复
      </div>
      <ul class="desc">
        <li v-for="(item, i) in config.repair" :key="i">
          {{ item }}
        </li>
      </ul>
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
    text-align: center;
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
  margin-bottom: 10px;
  .title {
    display: flex;
    align-items: center;
    font-weight: bold;
    margin-bottom: 10px;
    .u-icon {
      width: 32px;
      height: 32px;
      margin-right: 10px;
      vertical-align: middle;
    }
  }
  .desc {
    list-style-position: outside;
    box-sizing: border-box;
    list-style: disc;
    padding-left: 24px;
  }
}
</style>
