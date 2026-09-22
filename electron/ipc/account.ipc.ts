import { ipcMain, BrowserWindow } from 'electron'
import { accountHandle, getUserInfo, login, logout, getTodayDataCount, getRecommendCategory, getPieData } from '../services/account.services.js'
import { operationStore } from '../store/index.js'
export const accountIpc = (win: BrowserWindow) => {
  ipcMain.on('account', (event, args: 'register' | 'resetPassword') => {
    accountHandle(args, win)
  })

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

  ipcMain.handle('get-auth-status', async (event, data: any) => {
    return {
      expired: operationStore.get('expired')
    }
  })

  ipcMain.handle('getUserInfo', async (event, data: { token: string }) => {
    return await getUserInfo(data)
  })

  ipcMain.handle('logout', async (event, data: any) => {
    return await logout()
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
