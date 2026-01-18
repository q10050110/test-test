/**
 * 渲染进程日志工具
 */

interface ElectronLog {
  info: (...args: any[]) => void
  warn: (...args: any[]) => void
  error: (...args: any[]) => void
  debug: (...args: any[]) => void
}

declare global {
  interface Window {
    electronLog?: ElectronLog
  }
}

class Logger {
  private isDevelopment = import.meta.env.DEV

  /**
   * 信息日志
   */
  info(...args: any[]) {
    console.log('[INFO]', ...args)
    if (window.electronLog) {
      window.electronLog.info(...args)
    }
  }

  /**
   * 警告日志
   */
  warn(...args: any[]) {
    console.warn('[WARN]', ...args)
    if (window.electronLog) {
      window.electronLog.warn(...args)
    }
  }

  /**
   * 错误日志
   */
  error(...args: any[]) {
    console.error('[ERROR]', ...args)
    if (window.electronLog) {
      window.electronLog.error(...args)
    }
  }

  /**
   * 调试日志（仅开发环境）
   */
  debug(...args: any[]) {
    if (this.isDevelopment) {
      console.debug('[DEBUG]', ...args)
      if (window.electronLog) {
        window.electronLog.debug(...args)
      }
    }
  }
}

export const logger = new Logger()
export default logger
