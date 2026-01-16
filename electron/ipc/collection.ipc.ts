import { ipcMain, BrowserWindow } from 'electron'

export const accountIpc = (win: BrowserWindow) => {
  ipcMain.handle('', (event, args: 'register' | 'resetPassword') => {
    accountHandle(args)
  })
}
