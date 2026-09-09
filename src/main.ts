import { createApp } from 'vue'
import pinia from './stores'
import App from './App.vue'
import router from './router'
import '@/styles/index.css'
import './permissions'
import 'ant-design-vue/dist/reset.css'
import 'dayjs/locale/zh-cn'

import dayjs from 'dayjs'
dayjs.locale('zh-cn')

const app = createApp(App)

app.use(pinia)
app.use(router)

app.mount('#app')
