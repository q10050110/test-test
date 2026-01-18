import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router'
import Login from './modules/login'
import Layout from '@/layout/index.vue'
import selectGoods from './modules/selectGoods'
import logger from '@/utils/logger'

/**
 * 公共路由(无需权限)
 */
export const constantRoutes: RouteRecordRaw[] = [
  { path: '/', redirect: '/selectGoods' },
  Login
]

/**
 * 动态路由(需要权限)
 * 使用 Layout 作为父组件
 */
export const asyncRoutes: RouteRecordRaw[] = [
  {
    path: '/',
    component: Layout,
    children: [
      selectGoods
    ]
  }
]

const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes: [...constantRoutes, ...asyncRoutes],
})

// 路由前置守卫
router.beforeEach((to, from, next) => {
  logger.info(`路由跳转: ${from.path} -> ${to.path}`)
  next()
})

// 路由后置守卫
router.afterEach((to, from) => {
  logger.info(`路由跳转完成: ${to.path}`)
})

// 路由错误处理
router.onError((error) => {
  logger.error('路由错误:', error)
})

export default router

