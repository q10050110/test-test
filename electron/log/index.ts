import log from 'electron-log'
import os from 'os'
import { app } from 'electron'
import path from 'node:path'
import { formatWithOptions } from 'node:util'
import { SysTemUtils } from '../utils/system.js'
import { LogFileStore, LOG_POLICIES, localLogDate } from './file-store.js'
/**
 * 日志管理器类
 */
class LoggerManager {
  private static instance: LoggerManager
  private installDir: string
  private logPath: string
  private initialized = false

  private constructor() {
    this.installDir = app.getPath('userData')
    this.logPath = path.join(this.installDir, 'logs')
  }

  /**
   * 获取单例实例
   */
  public static getInstance(): LoggerManager {
    if (!LoggerManager.instance) {
      LoggerManager.instance = new LoggerManager()
    }
    return LoggerManager.instance
  }

  /**
   * 初始化日志系统
   */
  public initLogger(): typeof log {
    if (this.initialized) return log
    this.initialized = true

    // 主进程日志配置
    this.configureFileTransport()

    // 控制台日志配置
    this.configureConsoleTransport()

    // 设置异常处理器
    this.setupErrorHandler()

    // 记录启动信息
    this.logStartupInfo()

    return log
  }

  /**
   * 配置文件传输
   */
  private configureFileTransport(): void {
    // 禁用默认 .old 覆盖轮转，仍使用 electron-log 的级别、控制台和异常捕获。
    log.transports.file.level = false
    try {
      const files = new LogFileStore(this.logPath)
      log.transports.storage = Object.assign(
        (message: log.LogMessage) => {
          const date = message.date
          const time = [date.getHours(), date.getMinutes(), date.getSeconds()]
            .map((value) => String(value).padStart(2, '0'))
            .join(':')
          const scope = message.scope || 'system'
          const category =
            scope === 'business' || scope.startsWith('business:') ? 'business' : 'system'
          const text = formatWithOptions({ depth: 5, colors: false }, ...message.data)
          files.write(
            category,
            `[${localLogDate(date)} ${time}.${String(date.getMilliseconds()).padStart(3, '0')}] [${message.level}] [${scope}] [pid:${process.pid}] ${text}`,
          )
        },
        { level: 'info' as const, transforms: [] },
      )
    } catch (error) {
      console.error('初始化日志文件失败:', error)
    }
  }

  /**
   * 配置控制台传输
   */
  private configureConsoleTransport(): void {
    log.transports.console.level = SysTemUtils.getEnv() === 'development' ? 'debug' : 'info'
    log.transports.console.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}]{scope} {text}'
  }

  /**
   * 设置异常处理器
   */
  private setupErrorHandler(): void {
    log.errorHandler.startCatching({
      showDialog: false,
    })
  }

  /**
   * 记录启动信息
   */
  private logStartupInfo(): void {
    log.info('='.repeat(80))
    log.info('应用启动')
    log.info(`版本: ${app.getVersion()}`)
    log.info(`Electron: ${process.versions.electron}`)
    log.info(`Node: ${process.versions.node}`)
    log.info(`平台: ${process.platform}`)
    log.info(`架构: ${process.arch}`)
    log.info(`工作目录: ${process.cwd()}`)
    log.info(`安装目录: ${this.installDir}`)
    log.info(`日志目录: ${this.logPath}`)
    log.info('日志保留策略:', LOG_POLICIES)
    log.info(`环境: ${SysTemUtils.getEnv() || 'production'}`)
    log.info('='.repeat(80))
    log.info('设备信息')
    log.info(`主机名: ${os.hostname()}`)
    log.info(`系统类型: ${os.type()}`)
    log.info(`系统平台: ${os.platform()}`)
    log.info(`系统版本: ${os.release()}`)
    log.info(`CPU架构: ${os.arch()}`)
    log.info(`CPU型号: ${os.cpus()[0]?.model}`)
    log.info(`CPU核心数: ${os.cpus().length}`)
    log.info(`总内存: ${(os.totalmem() / 1024 / 1024 / 1024).toFixed(2)} GB`)
    log.info(`空闲内存: ${(os.freemem() / 1024 / 1024 / 1024).toFixed(2)} GB`)
    log.info(`用户目录: ${os.homedir()}`)
    log.info(`临时目录: ${os.tmpdir()}`)
    log.info('='.repeat(80))
  }
}

/**
 * 初始化日志系统
 */
export function initLogger(): typeof log {
  const loggerManager = LoggerManager.getInstance()
  return loggerManager.initLogger()
}

export default log
