import router from "./router";
import { useUserStore } from "./stores";

const whiteList = ['/login']
router.beforeEach(async (to, from, next) => {
  const store = useUserStore()
  const token = await store.getToken()
  if (token) {
    if (!store.user?._id) await store.initUser()
    if (to.path === '/login') {
      next('/')
    } else {
      next()
    }
  } else {
    if (whiteList.includes(to.path)) {
      next()
    } else {
      next('/login')
    }
  }
})

router.afterEach((to, from) => {

})