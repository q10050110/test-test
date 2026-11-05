import { OzonWindowService } from '../ozon/main-window.services.js'

export class MainWindowService extends OzonWindowService {
  async createCollectionWindow(url: string, signal?: AbortSignal) {
    signal?.throwIfAborted()
    const win = this.createBrowserWindow()
    try {
      await this.loadWindow(win, url, { event: 'dom-ready', timeoutMs: 100_000, readyDelayMs: 3000, signal })
      await this.checkPage(signal)
      signal?.throwIfAborted()
      if (win.isDestroyed()) throw new Error('采集窗口已关闭')
      return win
    } catch (error) { this.destroy(); throw error }
  }

  async scrollPage() { return this.scrollWindow() }

  async changeUrl(url: string, _waitForLoad = true, signal?: AbortSignal) {
    signal?.throwIfAborted()
    const win = this.browserWindow
    if (!win || win.isDestroyed()) throw new Error('窗口不存在或已销毁')
    const target = url.startsWith('https://') ? url : 'https://www.ozon.ru' + url
    await this.loadWindow(win, target, { signal })
    return true
  }
}
