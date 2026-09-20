import { AppstoreOutlined } from '@ant-design/icons-vue'
import { h } from 'vue'
export default {
  path: '/home',
  component: () => import('@/views/home/index.vue'),
  meta: {
    title: '首页',
    icon: h(AppstoreOutlined)
  },
}
