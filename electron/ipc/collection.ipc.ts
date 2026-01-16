import { ipcMain, BrowserWindow } from 'electron'

export const collectionIpc = (win: BrowserWindow) => {
  ipcMain.handle('collection', (event, args: 'register' | 'resetPassword') => {
    // accountHandle(args)
  })
}
