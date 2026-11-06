import pkg from 'electron-updater'
import { autoUpdater as nativeAutoUpdater, BrowserWindow } from 'electron'
import type { UpdateInfo } from 'electron-updater'
import log from '../log/index.js'
import { operationStore } from '../store/index.js'
const { autoUpdater } = pkg

export class UpdaterManager {
  private static instance: UpdaterManager | null = null
  private win: BrowserWindow | null = null
  private isInit = false
  private updateAvailable = false
  private downloaded = false
  private installing = false
  private beforeInstall: () => Promise<void> = async () => {}
  protected constructor() {}
  public static getInstance() {
    if (!UpdaterManager.instance) {
      UpdaterManager.instance = new UpdaterManager()
    }
    return UpdaterManager.instance
  }

  get isInstalling() {
    return this.installing
  }

  setBeforeInstall(callback: () => Promise<void>) {
    this.beforeInstall = callback
  }

  setMainWindow(win: BrowserWindow) {
    this.win = win
  }

  private send(channel: string, payload?: unknown) {
    if (this.win && !this.win.isDestroyed()) this.win.webContents.send(channel, payload)
  }

  private markDownloaded() {
    this.downloaded = true
    operationStore.set('update-status', 'downloaded')
    log.info('更新已下载并通过安装校验')
    this.send('update-downloaded')
  }

  private handleError(error: unknown) {
    this.installing = false
    this.downloaded = false
    const message = error instanceof Error ? error.message : String(error)
    log.error('更新错误', error)
    operationStore.set('update-status', this.updateAvailable ? 'hasUpdate' : 'hasNew')
    this.send('update-error', { message })
  }

  private registerEvents() {
    autoUpdater.on('checking-for-update', () => {
      log.info('检测版本是否为最新')
      this.send('update-checking')
    })

    autoUpdater.on('update-available', (info: UpdateInfo) => {
      log.info(info, '检测到新版本')
      this.updateAvailable = true
      if (operationStore.get('update-info')?.version !== info.version) this.downloaded = false
      // macOS 实际使用 ZIP 更新，不能用可能排在首位的 DMG 大小。
      const file =
        process.platform === 'darwin'
          ? (info.files.find(
              (file) => /\.zip(?:\?|$)/i.test(file.url) && file.url.includes(process.arch),
            ) ?? info.files.find((file) => /\.zip(?:\?|$)/i.test(file.url)))
          : info.files[0]
      const updateInfo = { version: info.version, date: info.releaseDate, size: file?.size ?? 0 }
      operationStore.set('update-info', updateInfo)
      operationStore.set(
        'update-status',
        this.downloaded ? 'downloaded' : autoUpdater.autoDownload ? 'download' : 'hasUpdate',
      )
      this.send('update-available', updateInfo)
    })

    autoUpdater.on('update-not-available', () => {
      this.updateAvailable = false
      this.downloaded = false
      log.info('当前为最新版本')
      operationStore.set('update-status', 'hasNew')
      this.send('update-not-available')
      // 缓存路径和清理由 electron-updater 管理，不能在 macOS 上拼接 LOCALAPPDATA。
    })

    autoUpdater.on('download-progress', (progress) => {
      operationStore.set('update-status', 'download')
      this.send('update-download-progress', {
        percent: Math.floor(progress.percent),
        speed: (progress.bytesPerSecond / 1024 / 1024).toFixed(1),
        downloaded: (progress.transferred / 1024 / 1024).toFixed(1),
        total: (progress.total / 1024 / 1024).toFixed(1),
      })
    })

    autoUpdater.on('update-downloaded', () => {
      // MacUpdater 此时仅下载了 ZIP；Squirrel.Mac 随后才解包并校验签名。
      if (process.platform === 'darwin') log.info('更新 ZIP 下载完成，等待 Squirrel.Mac 校验签名')
      else this.markDownloaded()
    })
    if (process.platform === 'darwin') {
      nativeAutoUpdater.on('update-downloaded', () => this.markDownloaded())
    }
    autoUpdater.on('error', (error) => this.handleError(error))
  }

  checkForUpdatesAndNotify() {
    return this.checkUpdate()
  }

  async checkUpdate() {
    if (this.installing || this.downloaded) return
    log.info('开始检测更新')
    try {
      const result = await autoUpdater.checkForUpdates()
      // 检测 Promise 与自动下载 Promise 独立，必须处理后者的拒绝。
      await result?.downloadPromise
      return result
    } catch (error) {
      // electron-updater 已发出 error 事件，避免未处理的 Promise 拒绝。
      log.warn('检测或下载更新失败', error)
    }
  }

  async startDownload() {
    if (this.installing || this.downloaded) return
    try {
      // 重启后仅有持久化状态，需重新检测，让 updater 恢复并验证缓存。
      if (!this.updateAvailable) {
        const result = await autoUpdater.checkForUpdates()
        if (!result?.isUpdateAvailable) return
        if (result.downloadPromise) {
          await result.downloadPromise
          return
        }
      }
      await autoUpdater.downloadUpdate()
    } catch (error) {
      log.warn('下载更新失败', error)
    }
  }

  async quitAndInstall() {
    if (this.installing) return
    try {
      if (!this.downloaded) throw new Error('更新尚未完成下载或签名校验，请下载完成后再安装。')
      this.installing = true
      await this.beforeInstall()
      // 只安装已校验的更新；再次 downloadUpdate 会重建 macOS 本地更新服务。
      autoUpdater.quitAndInstall()
    } catch (error) {
      this.handleError(error)
    }
  }

  public init() {
    if (this.isInit) return
    this.isInit = true
    autoUpdater.logger = log
    autoUpdater.autoDownload = process.platform === 'darwin'
    autoUpdater.allowDowngrade = false
    // macOS 必须让 Squirrel.Mac 提前准备、校验更新，退出时也可完成安装。
    autoUpdater.autoInstallOnAppQuit = process.platform === 'darwin'
    autoUpdater.autoRunAppAfterInstall = true
    // 上次进程中的 downloaded 不能代表本次进程的 native updater 已准备好。
    operationStore.set('update-status', 'hasNew')
    this.registerEvents()
  }
}
