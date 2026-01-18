import { app, BrowserWindow } from 'electron'
import { createWindow } from './windows/main.window.js'
import log, { initLogger } from './log/index.js'

// 初始化日志系统
initLogger()

/**
 * 应用准备就绪
 */
app.whenReady().then(() => {
  log.info('应用准备就绪，开始创建窗口')
  try {
    createWindow()
    log.info('主窗口创建成功')
  } catch (error) {
    log.error('创建主窗口失败:', error)
  }

  // macOS 激活时创建窗口
  app.on('activate', () => {
    log.info('应用被激活')
    if (BrowserWindow.getAllWindows().length === 0) {
      log.info('没有打开的窗口，重新创建窗口')
      createWindow()
    }
  })
})

/**
 * 所有窗口关闭时退出应用（macOS 除外）
 */
app.on('window-all-closed', () => {
  log.info('所有窗口已关闭')
  if (process.platform !== 'darwin') {
    log.info('非 macOS 平台，退出应用')
    app.quit()
  }
})

/**
 * 应用退出前的清理工作
 */
app.on('before-quit', () => {
  log.info('应用即将退出')
})