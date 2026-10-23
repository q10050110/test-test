import { OzonWindowService } from '../ozon/main-window.services.js'
import log from '../../log/index.js'

export class MainWindowService extends OzonWindowService {
  async createCollectionWindow(url: string, signal?: AbortSignal) {
    signal?.throwIfAborted()
    const win = this.createBrowserWindow({ webPreferences: { webSecurity: false } })
    try {
      await this.loadWindow(win, url, { event: 'dom-ready', timeoutMs: 100_000, signal })
      log.info('页面 DOM 已准备就绪')
      await this.checkPage(signal)
      signal?.throwIfAborted()
      if (win.isDestroyed()) throw new Error('巡查窗口已关闭')
      return win
    } catch (error) { this.destroy(); throw error }
  }

  async scrollPage() {
    return this.scrollWindow(0.65 + Math.random() * 0.25, 1000 + Math.random() * 3000)
  }
}
