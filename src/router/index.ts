import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router'
import Login from './modules/login'
import Layout from '@/layout/index.vue'
import selectGoods from './modules/selectGoods'
import inspection from './modules/inspection'
import home from './modules/home'
/**
 * 公共路由(无需权限)
 */
export const constantRoutes: RouteRecordRaw[] = [{ path: '/', redirect: '/home' }, Login]

/**
 * 动态路由(需要权限)
 * 使用 Layout 作为父组件
 */
export const asyncRoutes: RouteRecordRaw[] = [
  {
    path: '/',
    component: Layout,
    children: [home, selectGoods, inspection],
  },
]

const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes: [...constantRoutes, ...asyncRoutes],
})

export default router
