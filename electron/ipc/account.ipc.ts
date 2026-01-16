import { ipcMain, BrowserWindow } from 'electron'
import { accountHandle } from '../services/account.services.ts'
export const accountIpc = (win: BrowserWindow) => {
  ipcMain.on('account', (event, args: 'register' | 'resetPassword') => {
    accountHandle(args)
  })
}
