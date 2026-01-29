<script setup lang="ts">
import { useUserStore } from '@/stores';
import LayoutHeader from './header.vue';
import LayoutMenu from './menu.vue';

const store = useUserStore()
</script>

<template>
  <div class="layout-page">
    <div class="header">
      <LayoutHeader />
    </div>
    <div class="content">
      <div class="left">
        <div class="menu">
          <LayoutMenu />
        </div>
        <div class="user">
          <img src="@/assets/layout/avatar.png" alt="">
          <div class="info">
            <a-dropdown placement="bottom">
              <div class="username">
                {{ store.user?.name }}
                <span class="icon"></span>
              </div>
              <template #overlay>
                <a-menu>
                  <a-menu-item @click="store.logout(true)">退出登录</a-menu-item>
                </a-menu>
              </template>
            </a-dropdown>
            <div class="mobile">{{ store.user?.phone }}</div>
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

  .header {
    height: 50px;
    background-color: #fff;
    box-shadow: 0 2px 2px rgba(0, 0, 0, 0.3);
  }

  .content {
    display: flex;
    height: calc(100% - 50px);

    .left {
      display: flex;
      flex-direction: column;
      height: 100%;
      width: 180px;

      .menu {
        flex: 1;
      }

      .user {
        display: flex;
        justify-content: center;
        align-items: center;
        border-top: 1px solid rgba(0, 0, 0, 0.1);
        height: 80px;

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

    .main {
      padding: 40px 20px;
      flex: 1;
      background-color: #f5f7f9;
      overflow-y: auto;
      height: 100%;
    }
  }
}
</style>
