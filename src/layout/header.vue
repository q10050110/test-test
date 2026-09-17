<script setup lang="ts">
import { useAppStore, useUserStore } from '@/stores'

import {
  MinusOutlined,
  CloseOutlined,
  BorderOutlined,
  SwitcherOutlined,
} from '@ant-design/icons-vue'
const store = useAppStore()
const userStore = useUserStore()
const isMax = ref(false)
const open = ref(false)
const desc = ref('请确认是否要退出，如有选品数据未导出请先导出，退出后将无法找回。')
const btnText = computed(() => {
  if (store.updateStatus === 'downloaded') return '立即安装'
  return '立即下载'
})

// 隐藏&放大&关闭
const operationHandle = async (type: 'hide' | 'close' | 'maximize' | 'minimize') => {
  if (type === 'maximize' || type === 'minimize') isMax.value = !isMax.value
  window.electronAPI.sendMessage('window', type)
}

// 检测更新
const checkUpdateHandle = () => {
  if (store.updateStatus === 'downloaded') {
    window.electronAPI.sendMessage('start-downloaded-app', '')
  } else {
    window.electronAPI.sendMessage('check-update-app', '')
  }
}

// 退出
const clickHandle = () => {
  window.electronAPI.sendMessage('window', 'close')
}

const cancelHandle = () => {
  open.value = false
  desc.value = '请确认是否要退出，如有选品数据未导出请先导出，退出后将无法找回。'
}

window.electronAPI.on('maximize', () => {
  store.setRootFontSize()
  isMax.value = true
})

window.electronAPI.on('unmaximize', () => {
  store.setRootFontSize()
  isMax.value = false
})
</script>

<template>
  <div class="header-page">
    <div class="left">
      <img src="@/assets/login/logo.png" alt="" />
      <span class="version">V{{ store.appInfo?.version }}</span>
      <a-button type="primary" @click="checkUpdateHandle" v-if="store.updateStatus !== 'hasNew'">{{
        btnText
      }}</a-button>
    </div>
    <div class="drag"></div>
    <div class="right">
      <div class="customer-vip" @click="userStore.setShowVipModal(true)">
        <img src="@/assets/window/vip.png" style="margin-right: 5px" />
        开通/续费VIP
      </div>
      <div class="customer-service">
        <img src="@/assets/window/lianxikefu.png" alt="" />
        联系客服
        <div class="qrcode">
          <img
            :src="`https://ozonbang-test.oss-cn-beijing.aliyuncs.com/icons/customer.png?timestamp=${Date.now()}`"
            alt=""
          />
        </div>
      </div>
      <div class="operations">
        <MinusOutlined @click="operationHandle('hide')" />
        <component
          :is="isMax ? SwitcherOutlined : BorderOutlined"
          @click="operationHandle(isMax ? 'minimize' : 'maximize')"
          style="margin: 0 10px"
        />
        <CloseOutlined @click="operationHandle('close')" />
      </div>
    </div>
  </div>
  <a-modal
    v-model:open="open"
    @cancel="cancelHandle"
    class="modal"
    :footer="null"
    style="width: 400px"
  >
    <div class="container">
      <div class="bg"></div>
      <div class="title">要退出吗？</div>
      <div class="desc">
        {{ desc }}
      </div>
      <div class="btns">
        <a-button type="primary" style="margin-right: 20px" @click="clickHandle">确认退出</a-button>
        <a-button @click="cancelHandle">取消</a-button>
      </div>
    </div>
  </a-modal>
</template>

<style lang="scss" scoped>
.header-page {
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 100%;
  padding: 0 30px 0 20px;

  .left {
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

  .drag {
    flex: 1;
    -webkit-app-region: drag;
    min-height: 100%;
    min-width: 0;
  }

  .right {
    display: flex;
    justify-content: flex-end;
    align-items: center;

    img {
      width: 20px;
      object-fit: contain;
      vertical-align: middle;
    }

    .customer-vip {
      display: flex;
      align-items: center;
      height: 30px;
      font-size: 16px;
      color: #ffffff;
      background: linear-gradient(90deg, #1f5fff 0%, #06bafe 100%);
      border-radius: 16px;
      padding: 0 10px;
      margin-right: 20px;
      cursor: pointer;
    }

    .customer-service {
      margin-right: 20px;
      position: relative;
      display: flex;
      align-items: center;
      &:hover {
        .qrcode {
          visibility: visible;
          opacity: 1;
        }
      }

      .qrcode {
        visibility: hidden;
        opacity: 0;
        position: absolute;
        top: 20px;
        right: -50px;
        width: 200px;
        height: 200px;
        background: #fff;
        border-radius: 5px;
        box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
        z-index: 999;
        transition: all 1.2s;

        img {
          height: 100%;
          width: 100%;
        }
      }
    }

    .operations {
      font-size: 18px;
      color: #7f7f7f;
    }
  }
}

.modal {
  .container {
    position: relative;
    height: 200px;
    padding-top: 70px;
    text-align: center;

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
