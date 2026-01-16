import { ipcMain, BrowserWindow } from 'electron'
import { SysTemUtils } from '../utils/system.js'
export const windowIpc = (win: BrowserWindow) => {
  ipcMain.on('window', (event, data: 'hide' | 'close' | 'maximize' | 'minimize') => {
    switch (data) {
      case 'hide':
        SysTemUtils.appOperations.minimizeToTray(win)
        break;
      case 'close':
        SysTemUtils.appOperations.quit()
        break;
      case 'maximize':
        SysTemUtils.appOperations.maximize(win)
        break;
      default:
        SysTemUtils.appOperations.unmaximize(win)
        break;
    }
  })

  ipcMain.handle('app', (event, data: any) => {
    console.log(SysTemUtils.getAppInfo())
    return SysTemUtils.getAppInfo()
  })
}