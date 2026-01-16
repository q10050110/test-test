import { BrowserWindow } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resisterAllIpc } from '../ipc/main.ipc.ts'
// __dirname 表示当前文件所在目录的绝对路径
const __dirname = path.dirname(fileURLToPath(import.meta.url))
export let mainWindow: BrowserWindow | null
/**
 * 创建主窗口
 */
export const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    autoHideMenuBar: true,
    title: '上品帮自动化助手',
    frame: false,
    webPreferences: {
      nodeIntegration: false, // 禁止网页使用nodejs的API
      contextIsolation: true, // 启用上下文隔离
      preload: path.join(__dirname, '../preload.js')
    }
  })

  resisterAllIpc(mainWindow)
  // 开发环境开启调试台
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools()
  }
  // 生产环境加载打包后的文件
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:3000/login')
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}