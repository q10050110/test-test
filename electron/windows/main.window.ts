import { BrowserWindow } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resisterAllIpc } from '../ipc/main.ipc.js'
import log from '../log/index.js'

// __dirname 表示当前文件所在目录的绝对路径
const __dirname = path.dirname(fileURLToPath(import.meta.url))
export let mainWindow: BrowserWindow | null

/**
 * 创建主窗口
 */
export const createWindow = () => {
  log.info('开始创建主窗口...')

  const preloadPath = path.join(__dirname, '../../electron/preload.js')
  log.info(`Preload 脚本路径: ${preloadPath}`)

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    autoHideMenuBar: true,
    title: '上品帮自动化助手',
    frame: false,
    webPreferences: {
      nodeIntegration: false, // 禁止网页使用nodejs的API
      contextIsolation: true, // 启用上下文隔离
      preload: preloadPath
    }
  })

  log.info('BrowserWindow 实例创建成功')

  // 注册 IPC 处理器
  try {
    resisterAllIpc(mainWindow)
    log.info('IPC 处理器注册成功')
  } catch (error) {
    log.error('IPC 处理器注册失败:', error)
  }

  // 监听页面加载事件
  mainWindow.webContents.on('did-start-loading', () => {
    log.info('页面开始加载')
  })

  mainWindow.webContents.on('did-finish-load', () => {
    log.info('页面加载完成')
  })

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    log.error(`页面加载失败: [${errorCode}] ${errorDescription}`)
  })

  mainWindow.on('unresponsive', () => {
    log.warn('主窗口无响应')
  })

  mainWindow.on('responsive', () => {
    log.info('主窗口恢复响应')
  })

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    log.error('渲染进程消失:', details)
  })

  // 捕获控制台消息
  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    const levels = ['verbose', 'info', 'warn', 'error']
    log.info(`[渲染进程控制台 - ${levels[level]}] ${message} (${sourceId}:${line})`)
  })

  // 开发环境开启调试台
  if (process.env.NODE_ENV === 'development') {
    log.info('开发环境: 打开开发者工具')
    mainWindow.webContents.openDevTools()
  }

  // 加载页面
  if (process.env.NODE_ENV === 'development') {
    const devUrl = 'http://localhost:3000/login'
    log.info(`开发环境: 加载 URL - ${devUrl}`)
    mainWindow.loadURL(devUrl).catch(err => {
      log.error('加载开发服务器失败:', err)
    })
  } else {
    const indexPath = path.join(__dirname, '../../dist/index.html')
    log.info(`生产环境: 加载文件 - ${indexPath}`)
    mainWindow.loadFile(indexPath).catch(err => {
      log.error('加载 index.html 失败:', err)
    })
  }

  mainWindow.on('closed', () => {
    log.info('主窗口已关闭')
    mainWindow = null
  })
}