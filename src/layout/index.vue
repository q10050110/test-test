<script setup lang="ts">
import { useAppStore, useUserStore } from '@/stores'
import LayoutHeader from './header.vue'
import LayoutMenu from './menu.vue'

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
          <div class="user">
            <img src="@/assets/layout/avatar.png" alt="" />
            <div class="info">
              <a-dropdown placement="bottom">
                <div class="username">
                  {{ store.user?.name }}
                  <span class="icon"></span>
                </div>
                <template #overlay>
                  <a-menu>
                    <a-menu-item @click="logoutHandle">退出登录</a-menu-item>
                  </a-menu>
                </template>
              </a-dropdown>
              <div class="mobile">{{ store.user?.phone }}</div>
            </div>
          </div>
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
          img {
            width: 30px;
            margin-right: 10px;
            object-fit: contain;
          }

          .info {
            .username {
              display: flex;
              align-items: center;

              .icon {
                &::before {
                  content: '';
                  display: inline-block;
                  width: 0;
                  height: 0;
                  border-left: 4px solid transparent;
                  border-right: 4px solid transparent;
                  border-top: 6px solid #999; // 箭头颜色
                  margin-left: 4px;
                  transition: transform 0.2s ease;
                }
              }
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
</style>
