import { app, BrowserWindow } from 'electron'
import { createWindow } from './windows/main.window.ts'

/**
 * 应用准备就绪
 */
app.whenReady().then(() => {
  createWindow()

  // macOS 激活时创建窗口
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

/**
 * 所有窗口关闭时退出应用（macOS 除外）
 */
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

/**
 * 应用退出前的清理工作
 */
app.on('before-quit', () => {
  console.log('quit')
})