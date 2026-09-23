<script setup lang="ts">
import { useAppStore, useUserStore } from '@/stores'
import LayoutHeader from './header.vue'
import LayoutMenu from './menu.vue'
import { getVipName } from '@/enums/index'
import dayjs from 'dayjs'
const store = useUserStore()
const appStore = useAppStore()
const logoutHandle = async () => {
  appStore.openHandle('logout')
}

// 导出日志
const downloadLog = () => {
  window.electronAPI.invoke('export-all-logs', '')
}

// 跳转视频教程
const openUrl = () => {
  window.electronAPI.sendMessage('open-url', 'https://mp.weixin.qq.com/s/pmP_yl49F6I-wbyJKGdOxw')
}
</script>

<template>
  <div class="layout-page">
    <div class="header">
      <LayoutHeader />
    </div>
    <div class="content">
      <div class="left">
        <div class="menu">
          <div class="route">
            <label> 功能</label>
            <LayoutMenu />
          </div>
          <div class="link">
            <label>其他</label>
            <div class="list">
              <div class="item">
                <img src="@/assets/layout/video.png" class="item-icon" />
                <span @click="openUrl">视频教程</span>
              </div>
              <div class="item">
                <img src="@/assets/layout/export.png" class="item-icon" />
                <span @click="downloadLog">导出日志</span>
              </div>
            </div>
          </div>
          <a-popover>
            <template #title></template>
            <template #content>
              <div class="vip-popover-content">
                <div class="vip-card">
                  <div class="vip-title">
                    <img
                      src="@/assets/window/vip-user.png"
                      alt=""
                      style="width: 18px; height: 18px; margin-right: 10px"
                    />
                    {{
                      store.user?.auto_vip_type === 0
                        ? '非会员'
                        : getVipName(store.user?.auto_vip_type as 0 | 1 | 2 | 3 | 4)
                    }}
                  </div>
                  <div class="vip-tips">
                    <div>{{ store.user?.auto_vip_type === 0 ? '请开通会员' : '到期时间：' }}</div>
                    <div v-if="store.user?.auto_vip_type !== 0">
                      {{ dayjs(store.user?.expire_time).format('YYYY-MM-DD HH:mm:ss') }}
                    </div>
                  </div>
                  <a-button type="primary" class="vip-btn" @click="store.setShowVipModal(true)">{{
                    store.user?.auto_vip_type === 0 ? '去开通' : '去续费'
                  }}</a-button>
                </div>
                <a-button type="link" @click="logoutHandle" class="logout-btn">退出登录</a-button>
              </div>
            </template>
            <div class="user">
              <img src="@/assets/layout/avatar.png" alt="" />
              <div class="info">
                <div class="username ellipsis-1" :title="store.user?.name">
                  {{ store.user?.name }}
                </div>
                <!--  <div @click="logoutHandle">退出登录</div> -->
                <div class="mobile">{{ store.user?.phone }}</div>
              </div>
            </div>
          </a-popover>
        </div>
      </div>
      <div class="main">
        <routerView />
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.layout-page {
  height: 100vh;
  background-color: #f4f6f9;
  box-sizing: border-box;
  .header {
    height: 50px;
    background-color: #fff;
    margin-bottom: 10px;
  }

  .content {
    display: flex;
    height: calc(100% - 60px);

    .left {
      display: flex;
      flex-direction: column;
      height: 100%;
      width: 180px;

      .menu {
        padding: 0 5px;
        flex: 1;
        margin-right: 10px;
        background: #fff;
        border-radius: 5px;
        display: flex;
        flex-direction: column;
        .route {
          flex: 1.5;
        }
        label {
          display: block;
          padding: 20px;
          font-size: 12px;
          color: #999999;
        }
        .link {
          border-top: 1px solid #f4f6f9;
          flex: 1;
          .list {
            padding: 0px 20px;
            font-size: 16px;
            color: #333333;
            .item {
              display: flex;
              align-items: center;
              margin-bottom: 18px;
              cursor: pointer;
              &-icon {
                width: 16px;
                height: 16px;
                margin-right: 8px;
              }
            }
          }
        }
        .user {
          display: flex;
          justify-content: center;
          align-items: center;
          border-top: 1px solid #f4f6f9;
          height: 80px;
          padding: 0 5px;
          background-color: #fff;
          cursor: pointer;
          img {
            width: 30px;
            margin-right: 10px;
            object-fit: contain;
          }

          .info {
            .username {
              width: 110px;
            }
          }
        }
      }
    }

    .main {
      padding-right: 10px;
      flex: 1;
      border-radius: 5px;
      overflow-y: auto;
      height: 100%;
    }
  }
}

.vip-popover-content {
  padding: 4px 0;
  width: 140px;
  display: flex;
  flex-direction: column;
  align-items: center;

  .vip-card {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    border-bottom: 1px solid #d9d9d9;
    margin-bottom: 20px;
    .vip-title {
      display: flex;
      align-items: center;
      font-weight: 500;
      font-size: 14px;
      color: #602d02;
      height: 20px;
      line-height: 20px;
      margin-bottom: 10px;
    }

    .vip-tips {
      text-align: center;
      font-weight: 400;
      font-size: 14px;
      color: #666666;
      height: 20px;
      line-height: 20px;
      margin-bottom: 25px;
    }

    .vip-btn {
      font-weight: 500;
      font-size: 14px;
      color: #5f2c01;
      width: 77px;
      background: linear-gradient(90deg, #eed4a4 0%, #e7c281 100%);
      border-radius: 20px;
      margin-bottom: 20px;
    }
  }

  .logout-btn {
    font-weight: 500;
    font-size: 14px;
    color: #1f5fff;
  }
}
</style>
