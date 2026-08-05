import { h } from 'vue'
import icon from '@/assets/layout/inspection.png'
export default {
  path: '/inspection',
  redirect: '/inspection/list',
  meta: {
    title: '跟卖巡查',
    icon: () => h('img', { src: icon, style: { width: '16px', height: '16px' } }),
  },
  children: [
    {
      path: '/inspection/list',
      component: () => import('@/views/automaticInspection/index.vue'),
      meta: { title: '巡查任务' },
    },
    {
      path: '/inspection/result',
      component: () => import('@/views/automaticInspection/result.vue'),
      meta: { title: '巡查结果' },
    },
  ],
}
