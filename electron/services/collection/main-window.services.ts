import { BrowserWindow } from 'electron'
import log from '../../log/index.js'
import { randomUUID } from 'node:crypto'
import { abortableDelay } from './task-scope.js'

export class MainWindowService {
  private browserWindow: BrowserWindow | null = null
  private isCheck: boolean = false
  private closeHandle: (() => void) | null = null
  constructor(closeHandle: () => void) {
    this.closeHandle = closeHandle
  }
  /**
   * 创建采集窗口
   */
  async createCollectionWindow(url: string, signal?: AbortSignal) {
    signal?.throwIfAborted()
    const win = new BrowserWindow({
      width: 1200,
      height: 800,
      show: true,
      webPreferences: {
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        backgroundThrottling: false,
      },
    })
    this.browserWindow = win
    win.once('closed', () => {
      if (this.browserWindow === win) {
        this.browserWindow = null
        this.closeHandle?.()
      }
    })
    win.webContents.once('render-process-gone', () => {
      if (this.browserWindow === win) this.closeHandle?.()
    })
    try {
      await this.load(win, url, 'dom-ready', 100_000, signal, 3000)
      return win
    } catch (error) {
      this.destroy()
      throw error
    }
  }

  private load(
    win: BrowserWindow,
    url: string,
    event: 'dom-ready' | 'did-finish-load',
    ms: number,
    signal?: AbortSignal,
    delay = 0,
  ): Promise<void> {
    signal?.throwIfAborted()
    return new Promise((resolve, reject) => {
      const wc = win.webContents
      let settled = false
      let readyTimer: NodeJS.Timeout | undefined
      const cleanup = () => {
        clearTimeout(deadline)
        clearTimeout(readyTimer)
        wc.removeListener('dom-ready', ready)
        wc.removeListener('did-finish-load', ready)
        wc.removeListener('did-fail-load', failed)
        win.removeListener('closed', closed)
        signal?.removeEventListener('abort', abort)
      }
      const finish = (error?: unknown) => {
        if (settled) return
        settled = true
        cleanup()
        if (error) reject(error)
        else resolve()
      }
      const ready = () => {
        readyTimer = setTimeout(() => finish(), delay)
      }
      const failed = (
        _event: unknown,
        code: number,
        description: string,
        _url: string,
        isMainFrame: boolean,
      ) => {
        if (isMainFrame && code !== -3) finish(new Error(description))
      }
      const closed = () => finish(new Error('采集窗口已关闭'))
      const abort = () => {
        finish(signal?.reason)
        if (!wc.isDestroyed()) wc.stop()
      }
      const deadline = setTimeout(() => finish(new Error('页面加载超时')), ms)
      if (event === 'dom-ready') wc.once('dom-ready', ready)
      else wc.once('did-finish-load', ready)
      wc.on('did-fail-load', failed)
      win.once('closed', closed)
      signal?.addEventListener('abort', abort, { once: true })
      void win.loadURL(url).catch((error) => finish(error))
    })
  }

  /**
   * 获取domin
   */
  async getDomain() {
    if (!this.browserWindow || this.browserWindow.isDestroyed()) {
      return ''
    }
    const wc = this.browserWindow.webContents
    const domain = new URL(wc.getURL()).origin
    return domain
  }
  /**
   * 获取页面
   */
  async getHTML(signal?: AbortSignal) {
    signal?.throwIfAborted()
    if (!this.browserWindow || this.browserWindow.isDestroyed()) {
      return { html: undefined, domain: '' }
    }
    const wc = this.browserWindow.webContents
    if (!this.isCheck) {
      this.isCheck = true
      // 1. 点击
      const result = await wc.executeJavaScript(`
        (() => {
          try {
            const p = document.querySelector('body > div.con p.h')
            if (!p) return { ok: false, reason: 'p not found' }

            const btn = document.querySelector('.rb')
            if (!btn) return { ok: false, reason: 'btn not found' }

            btn.click()
            return { ok: true }
          } catch (e) {
            return {
              ok: false,
              error: e?.message || String(e)
            }
          }
        })()
      `)
      log.info('点击结果:', result)
      if (result?.ok) await abortableDelay(2000, signal)
    }

    signal?.throwIfAborted()
    const html = await wc.executeJavaScript('document.documentElement.outerHTML')

    const domain = new URL(wc.getURL()).origin
    return { html, domain }
  }
  /**
   * 滚动页面
   */
  async scrollPage() {
    if (!this.browserWindow || this.browserWindow.isDestroyed()) return false

    try {
      const result = await this.browserWindow.webContents.executeJavaScript(`(function () {
        return new Promise(resolve => {
          const startY = window.scrollY;
          const windowHeight = window.innerHeight;
          const documentHeight = document.documentElement.scrollHeight;

          const scrollAmount = Math.floor(windowHeight * 0.8);
          const targetY = Math.min(
            startY + scrollAmount,
            documentHeight - windowHeight
          );

          if (startY >= documentHeight - windowHeight - 10) {
            resolve(false);
            return;
          }

          const duration = 3000; // 滚动时长 ms
          const startTime = performance.now();

          function step(now) {
            const progress = Math.min((now - startTime) / duration, 1);
            const ease = progress < 0.5
              ? 2 * progress * progress
              : 1 - Math.pow(-2 * progress + 2, 2) / 2;

            window.scrollTo(0, startY + (targetY - startY) * ease);

            if (progress < 1) {
              requestAnimationFrame(step);
            } else {
              resolve(true);
            }
          }

          requestAnimationFrame(step);
        });
      })();`)
      return result === true
    } catch (error) {
      throw new Error(error as string)
    }
  }

  /**
   * 获取跟卖数据
   */
  async getSellingData(requestUrl: string, signal?: AbortSignal) {
    if (!this.browserWindow || this.browserWindow.isDestroyed()) return
    try {
      return await this.fetchPage(requestUrl, signal)
    } catch (error) {
      signal?.throwIfAborted()
      return false
    }
  }

  /**
   * 改变当前窗口 URL
   */
  async changeUrl(url: string, waitForLoad = true, signal?: AbortSignal) {
    signal?.throwIfAborted()
    const win = this.browserWindow
    if (!win || win.isDestroyed()) throw new Error('窗口不存在或已销毁')
    const target = url.startsWith('https://') ? url : 'https://www.ozon.ru' + url
    await this.load(win, target, 'did-finish-load', 60_000, signal)
    return true
  }

  /**
   * 通过接口获取页面数据
   */
  async getDataByApi(id: string, signal?: AbortSignal) {
    try {
      const target = `https://www.ozon.ru/api/entrypoint-api.bx/page/json/v2?url=%2Fproduct%2Flastik-dlya-obuvi-sredstvo-dlya-suhoy-chistki-obuvi-${id}`
      return await this.fetchPage(target, signal)
    } catch (error) {
      signal?.throwIfAborted()
      console.log('获取页面数据报错~~')
      return { success: false, data: {} }
    }
  }

  /**
   * 关闭采集窗口
   */
  private async fetchPage(url: string, signal?: AbortSignal) {
    signal?.throwIfAborted()
    const wc = this.browserWindow?.webContents
    if (!wc || wc.isDestroyed()) throw new Error('采集窗口已关闭')
    const id = JSON.stringify(randomUUID())
    const abort = () => {
      if (!wc.isDestroyed())
        void wc
          .executeJavaScript(`window.__collectionRequests?.get(${id})?.abort()`)
          .catch(() => undefined)
    }
    signal?.addEventListener('abort', abort, { once: true })
    try {
      const result = await wc.executeJavaScript(`(async () => {
        const requests = window.__collectionRequests ||= new Map();
        const controller = new AbortController();
        requests.set(${id}, controller);
        try {
          const response = await fetch(${JSON.stringify(url)}, { credentials: 'include', signal: controller.signal });
          return { success: response.ok, data: await response.json() };
        } finally { requests.delete(${id}); }
      })()`)
      signal?.throwIfAborted()
      return result
    } finally {
      signal?.removeEventListener('abort', abort)
    }
  }

  destroy() {
    const win = this.browserWindow
    this.browserWindow = null
    this.closeHandle = null
    if (win && !win.isDestroyed()) win.destroy()
  }
}
