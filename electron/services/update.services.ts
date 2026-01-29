import pkg from 'electron-updater'
import { BrowserWindow } from 'electron'
import type { UpdateInfo } from 'electron-updater'
import log from '../log/index.js'

const { autoUpdater } = pkg

export class UpdaterManager {
  private static instance: UpdaterManager | null = null
  private win: BrowserWindow | null = null
  private isInit = false
  protected constructor() { }
  public static getInstance() {
    if (!UpdaterManager.instance) {
      UpdaterManager.instance = new UpdaterManager()
    }
    return UpdaterManager.instance
  }

  setMainWindow(win: BrowserWindow) {
    this.win = win
  }

  // 通知渲染层
  private send(channel: string, payload?: any) {
    if (this.win && !this.win.isDestroyed()) this.win.webContents.send(channel, payload)
  }

  // 注册IPC通道
  private registerEvents() {
    autoUpdater.on('checking-for-update', () => {
      log.info('检测版本是否为最新')
      this.send('update-checking')
    })

    autoUpdater.on('update-available', (info: UpdateInfo) => {
      log.info('检测到新版本')
      this.send('update-available', {
        version: info.version,
        releaseNotes: info.releaseNotes
      })
    })

    autoUpdater.on('update-not-available', () => {
      log.info('当前为最新版本')
      this.send('update-not-available')
    })

    autoUpdater.on('download-progress', progress => {
      this.send('update-download-progress', {
        percent: Math.floor(progress.percent),
        transferred: progress.transferred,
        total: progress.total
      })
    })

    autoUpdater.on('update-downloaded', () => {
      log.info('更新下载完成')
      this.send('update-downloaded')
    })

    autoUpdater.on('error', (error) => {
      log.error('更新错误', error)
      this.send('update-error', error)
    })
  }

  /** 
   * 手动触发检测更新
    */
  checkUpdate() {
    log.info('开始检测更新')
    return autoUpdater.checkForUpdates()
  }

  /** 
   * 开始更新
  */
  startDownload() {
    autoUpdater.downloadUpdate()
  }

  /**  
   * 安装并重启
   */
  quitAndInstall() {
    autoUpdater.quitAndInstall()
  }
  /** 
   * 初始化  
   */
  public async init() {
    if (this.isInit) return
    this.isInit = true
    autoUpdater.autoDownload = false
    autoUpdater.allowDowngrade = false
    this.registerEvents()
  }
}