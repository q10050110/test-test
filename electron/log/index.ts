import log from 'electron-log'
import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'

/**
 * 日志配置
 */
export function initLogger() {
  // 设置日志文件路径 - 使用安装目录下的 LOG 文件夹
  const installDir = path.dirname(process.execPath)
  const logPath = path.join(installDir, 'LOG')

  // 确保日志目录存在
  if (!fs.existsSync(logPath)) {
    fs.mkdirSync(logPath, { recursive: true })
  }

  // 清理旧日志文件，只保留最近5天的日志
  cleanupOldLogs(logPath)

  // 主进程日志配置
  log.transports.file.level = 'info'
  log.transports.file.maxSize = 10 * 1024 * 1024 // 10MB
  log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}'
  log.transports.file.resolvePathFn = () => {
    // 按日期生成日志文件名
    const date = new Date()
    const fileName = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}.log`
    return path.join(logPath, fileName)
  }

  // 控制台日志配置
  log.transports.console.level = process.env.NODE_ENV === 'development' ? 'debug' : 'info'
  log.transports.console.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}'

  // 捕获未处理的异常
  log.errorHandler.startCatching({
    showDialog: false,
    onError(error) {
      log.error('未捕获的异常:', error)
    }
  })

  // 捕获未处理的 Promise 拒绝
  process.on('unhandledRejection', (reason, promise) => {
    log.error('未处理的 Promise 拒绝:', reason)
  })

  log.info('='.repeat(80))
  log.info('应用启动')
  log.info(`版本: ${app.getVersion()}`)
  log.info(`Electron: ${process.versions.electron}`)
  log.info(`Node: ${process.versions.node}`)
  log.info(`平台: ${process.platform}`)
  log.info(`架构: ${process.arch}`)
  log.info(`工作目录: ${process.cwd()}`)
  log.info(`安装目录: ${installDir}`)
  log.info(`日志目录: ${logPath}`)
  log.info(`环境: ${process.env.NODE_ENV || 'production'}`)
  log.info('='.repeat(80))

  return log
}

// 清理超过5天的日志文件
function cleanupOldLogs(logPath: string) {
  try {
    const files = fs.readdirSync(logPath)

    // 提取日期并排序
    const logFilesWithDate = files
      .filter(file => /^\d{4}-\d{2}-\d{2}\.log$/.test(file)) // 匹配 YYYY-MM-DD.log 格式
      .map(file => {
        const dateStr = file.split('.')[0] // 移除 .log 后缀
        return {
          file,
          date: new Date(dateStr),
          fullPath: path.join(logPath, file)
        }
      })
      .sort((a, b) => b.date.getTime() - a.date.getTime()) // 按日期降序排列

    // 删除超过5天的旧日志
    for (let i = 5; i < logFilesWithDate.length; i++) {
      fs.unlinkSync(logFilesWithDate[i].fullPath)
      console.log(`删除旧日志文件: ${logFilesWithDate[i].file}`)
    }
  } catch (error) {
    console.error('清理旧日志文件时出错:', error)
  }
}

export default log