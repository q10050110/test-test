import { ipcMain } from 'electron'
import log from '../log/index.js'
const rendererLog = log.scope('renderer')

/**
 * 注册日志相关的 IPC 处理器
 */
export function registerLogIpc() {
  // 信息日志
  ipcMain.handle('log-info', (event, args) => {
    rendererLog.info('[渲染进程]', ...args)
  })

  // 警告日志
  ipcMain.handle('log-warn', (event, args) => {
    rendererLog.warn('[渲染进程]', ...args)
  })

  // 错误日志
  ipcMain.handle('log-error', (event, args) => {
    rendererLog.error('[渲染进程]', ...args)
  })

  // 调试日志
  ipcMain.handle('log-debug', (event, args) => {
    rendererLog.debug('[渲染进程]', ...args)
  })

  log.info('日志 IPC 处理器已注册')
}
