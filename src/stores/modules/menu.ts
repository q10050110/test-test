import { defineStore } from 'pinia'
import { computed } from 'vue'
import type { MenuItem } from '@/types/menu'
import { asyncRoutes } from '@/router'
import type { RouteRecordRaw } from 'vue-router'

export const useMenuStore = defineStore('menu', () => {
  // 从路由配置生成菜单
  const generateMenuFromRoutes = (routes: RouteRecordRaw[]): MenuItem[] => {
    const menus: MenuItem[] = []
    
    routes.forEach(route => {
      if (route.children) {
        route.children.forEach(child => {
          if (child.meta?.title) {
            const menu: MenuItem = {
              title: child.meta.title as string,
              path: child.path,
              icon: child.meta.icon as string,
              hidden: child.meta.hidden as boolean
            }
            
            // 如果有子路由,递归处理
            if (child.children && child.children.length > 0) {
              menu.children = generateMenuFromRoutes([child])
            }
            
            menus.push(menu)
          }
        })
      } else if (route.meta?.title) {
        menus.push({
          title: route.meta.title as string,
          path: route.path,
          icon: route.meta.icon as string,
          hidden: route.meta.hidden as boolean
        })
      }
    })
    
    return menus
  }

  // 菜单列表(从路由自动生成)
  const menuList = computed(() => generateMenuFromRoutes(asyncRoutes))

  return {
    menuList
  }
})
