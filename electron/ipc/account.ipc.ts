import { ipcMain, BrowserWindow } from 'electron'
import { accountHandle, resetToken } from '../services/account.services.js'

export const accountIpc = (win: BrowserWindow) => {
  ipcMain.on('account', (event, args: 'register' | 'resetPassword') => {
    accountHandle(args)
  })

  ipcMain.handle('resetToken', async (event, data: { token: string }) => {
    await resetToken(data)
    return true
  })
}
