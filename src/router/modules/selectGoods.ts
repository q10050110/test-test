import { ShoppingOutlined } from '@ant-design/icons-vue'
import { h } from 'vue'
export default {
  path: '/selectGoods',
  component: () => import('@/views/selectGoods/index.vue'),
  meta: {
    title: '自动化选品',
    icon: h(ShoppingOutlined),
  },
}
