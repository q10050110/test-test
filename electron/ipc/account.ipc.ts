import { ipcMain, BrowserWindow } from 'electron'
import { accountHandle, getUserInfo, login, logout, getVipInfo, getVipPayInfo, payVip, getVipPayResult, getTodayDataCount, getRecommendCategory, getPieData } from '../services/account.services.js'
import { operationStore } from '../store/index.js'
export const accountIpc = (win: BrowserWindow) => {
  /** 
   * 账号操作
    */
  ipcMain.on('account', (event, args: 'register' | 'resetPassword') => {
    accountHandle(args, win)
  })

  /** 
   * 登录
    */
  ipcMain.handle(
    'login',
    async (
      event,
      data: {
        phone: string
        pwd: string
      },
    ) => {
      return await login(data)
    },
  )

  /** 
   * 获取登录状态
    */
  ipcMain.handle('get-auth-status', async (event, data: any) => {
    return {
      expired: operationStore.get('expired')
    }
  })

  /** 
   * 获取用户信息
  */
  ipcMain.handle('getUserInfo', async (event, data: { token: string }) => {
    return await getUserInfo(data)
  })

  /** 
   * 登出
    */
  ipcMain.handle('logout', async (event, data: any) => {
    return await logout()
  })

  /** 
   * 获取会员配置信息
    */
  ipcMain.handle('get-vip-info', async (event, data: any) => {
    return await getVipInfo()
  })

  /** 
   * 获取会员支付信息
    */
  ipcMain.handle('get-vip-pay-info', async (event, data: { auto_vip_type: 1 | 2 | 3 | 4 }) => {
    return await getVipPayInfo(data.auto_vip_type)
  })

  /** 
   * 发起支付
    */
  ipcMain.handle('pay-vip', async (event, data: { auto_vip_type: 1 | 2 | 3 | 4 }) => {
    return await payVip(data.auto_vip_type)
  })

  /** 
   * 查询支付结果
    */
  ipcMain.handle('get-vip-pay-result', async (event, data: { mchOrderNo: string }) => {
    return await getVipPayResult(data.mchOrderNo)
  })

  ipcMain.handle('get-today-data-count', async (event, data: any) => {
    return await getTodayDataCount()
  })

  ipcMain.handle('get-recommend-category', async (event, data: any) => {
    return await getRecommendCategory()
  })

  ipcMain.handle('get-pie-data', async (event, data: any) => {
    return await getPieData()
  })
}
