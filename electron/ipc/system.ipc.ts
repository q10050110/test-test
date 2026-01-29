import { ipcMain, BrowserWindow } from 'electron'
import { SysTemUtils } from '../utils/system.js'
import { UpdaterManager } from '../services/update.services.js'
export const windowIpc = (win: BrowserWindow) => {
  ipcMain.on('window', async (event, data: 'hide' | 'close' | 'maximize' | 'minimize') => {
    switch (data) {
      case 'hide':
        SysTemUtils.appOperations.minimizeToTray(win)
        break;
      case 'close':
        SysTemUtils.appOperations.quit(win)
        break;
      case 'maximize':
        SysTemUtils.appOperations.maximize(win)
        break;
      default:
        SysTemUtils.appOperations.unmaximize(win)
        break;
    }
  })

  ipcMain.on('app-quit', (event, data: any) => {
    SysTemUtils.appOperations.appQuit()
  })

  ipcMain.handle('app', (event, data: any) => {
    return SysTemUtils.getAppInfo()
  })

  ipcMain.handle('export-all-logs', async () => {
    return await SysTemUtils.logOperations.exportAllLogs();
  });

  ipcMain.on('check-update-app', async () => {
    UpdaterManager.getInstance().checkUpdate()
  })

  ipcMain.on('start-update-app', async () => {
    UpdaterManager.getInstance().startDownload()
  })

  ipcMain.on('quit-and-install-app', async () => {
    UpdaterManager.getInstance().quitAndInstall()
  })
}