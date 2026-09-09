<script setup lang="ts">
import { useMenuStore } from '@/stores'
import { useRouter, useRoute } from 'vue-router'
import { computed, h } from 'vue'
import type { MenuItem } from '@/types/menu'
import type { MenuProps, ItemType } from 'ant-design-vue'

const menuStore = useMenuStore()
const router = useRouter()
const route = useRoute()

// 当前选中的菜单key
const selectedKeys = computed(() => [route.path])

// 当前展开的菜单key
const openKeys = ref<string[]>([])

// 递归转换菜单数据为 antd menu 格式
const convertMenuItems = (menus: MenuItem[]): ItemType[] => {
  return menus
    .filter((item) => !item.hidden)
    .map((item) => {
      const menuItem: ItemType = {
        key: item.path,
        label: item.title,
        icon: item.icon,
      }
      // 如果有子菜单,递归处理
      if (item.children && item.children.length > 0) {
        menuItem.children = convertMenuItems(item.children)
      }

      return menuItem
    })
}

// 转换后的菜单数据
const menuItems = computed(() => convertMenuItems(menuStore.menuList))
// 菜单点击处理
const handleMenuClick: MenuProps['onClick'] = ({ key }) => {
  router.push(key as string)
}

// 子菜单展开/收起处理
const handleOpenChange: MenuProps['onOpenChange'] = (keys) => {
  openKeys.value = keys as string[]
}

// 初始化展开的菜单(根据当前路由)
const initOpenKeys = () => {
  const path = route.path
  const keys: string[] = []

  // 递归查找父级菜单
  const findParentKeys = (menus: MenuItem[], parentKey = '') => {
    for (const item of menus) {
      if (item.path === path && parentKey) {
        keys.push(parentKey)
      }
      if (item.children) {
        findParentKeys(item.children, item.path)
      }
    }
  }

  findParentKeys(menuStore.menuList)
  openKeys.value = keys
}

// 初始化
initOpenKeys()
</script>

<template>
  <div class="menu-container">
    <a-menu
      v-model:selectedKeys="selectedKeys"
      v-model:openKeys="openKeys"
      mode="inline"
      :items="menuItems"
      @click="handleMenuClick"
      @openChange="handleOpenChange"
    />
  </div>
</template>

<style lang="scss" scoped>
:deep(.ant-menu-submenu-selected) {
  .ant-menu-item-icon {
    filter: invert(40%) sepia(90%) saturate(3000%) hue-rotate(200deg);
  }
}

.menu-container {
  height: 100%;
  background-color: #fff;
  overflow-y: auto;

  :deep(.ant-menu) {
    border-right: none;
    height: 100%;
  }

  :deep(.ant-menu-item),
  :deep(.ant-menu-submenu-title) {
    margin: 0;
    width: 100%;
  }

  :deep(.ant-menu-item-selected) {
    background-color: #e6f7ff;
  }

  // 滚动条样式
  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-thumb {
    background-color: rgba(0, 0, 0, 0.2);
    border-radius: 3px;

    &:hover {
      background-color: rgba(0, 0, 0, 0.3);
    }
  }
}
</style>
