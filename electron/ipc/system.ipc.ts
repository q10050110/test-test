import { ipcMain, BrowserWindow } from 'electron'
import { SysTemUtils } from '../utils/system.js'
export const windowIpc = (win: BrowserWindow) => {
  ipcMain.on('window', async (event, data: 'hide' | 'close' | 'maximize' | 'minimize') => {
    switch (data) {
      case 'hide':
        SysTemUtils.appOperations.minimizeToTray(win)
        break;
      case 'close':
        const res = await SysTemUtils.dialogOperations.showConfirmDialog('温馨提示：', '确认要离开吗？期待下次再见！')
        if (!res) return
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
    return SysTemUtils.getAppInfo()
  })

  ipcMain.handle('export-all-logs', async () => {
    return await SysTemUtils.logOperations.exportAllLogs();
  });
}