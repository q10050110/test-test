import { createApp } from 'vue'
import pinia from './stores'
import App from './App.vue'
import router from './router'
import '@/styles/reset.scss'
import './permissions'
import { ConfigProvider } from 'ant-design-vue'
import zhCN from 'ant-design-vue/es/locale/zh_CN'
import 'dayjs/locale/zh-cn'
const app = createApp(App)

app.use(pinia)
app.use(router)
app.use(ConfigProvider, {
  locale: zhCN
})
app.mount('#app')