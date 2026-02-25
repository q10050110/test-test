import { ipcMain, BrowserWindow } from 'electron'
import { accountHandle, getUserInfo, login, logout } from '../services/account.services.js'

export const accountIpc = (win: BrowserWindow) => {
  ipcMain.on('account', (event, args: 'register' | 'resetPassword') => {
    accountHandle(args)
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

  ipcMain.handle('getUserInfo', async (event, data: { token: string }) => {
    return await getUserInfo(data)
  })

  ipcMain.handle('logout', async (event, data: any) => {
    return await logout()
  })
}
