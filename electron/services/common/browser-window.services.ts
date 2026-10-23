import { BrowserWindow, type BrowserWindowConstructorOptions } from 'electron'
import { randomUUID } from 'node:crypto'
import { TaskCancelledError } from './task-scope.services.js'

export interface WindowLoadOptions {
  event?: 'dom-ready' | 'did-finish-load'
  timeoutMs?: number
  readyDelayMs?: number
  signal?: AbortSignal
  allowHttpErrorPage?: boolean
}

export interface PageResponse {
  success: boolean
  status: number
  contentType: string
  url: string
  redirected: boolean
  data: any
}

/** 单窗口所有权与页面 I/O；网站地址、选择器和页面检查留给业务子类。 */
export class BrowserWindowService {
  protected browserWindow: BrowserWindow | null = null
  private detachLifecycle?: () => void

  constructor(private closeHandle: (() => void) | null = null) {}

  protected createBrowserWindow(options: BrowserWindowConstructorOptions = {}) {
    this.releaseWindow()
    const win = new BrowserWindow({
      width: 1200,
      height: 800,
      show: true,
      ...options,
      webPreferences: {
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        backgroundThrottling: false,
        ...options.webPreferences,
      },
    })
    this.browserWindow = win
    const wc = win.webContents
    const closed = () => {
      if (this.browserWindow !== win) return
      this.browserWindow = null
      this.detachLifecycle?.()
      this.detachLifecycle = undefined
      this.closeHandle?.()
    }
    const crashed = () => {
      if (this.browserWindow === win) this.closeHandle?.()
    }
    win.once('closed', closed)
    wc.once('render-process-gone', crashed)
    this.detachLifecycle = () => {
      win.removeListener('closed', closed)
      wc.removeListener('render-process-gone', crashed)
    }
    return win
  }

  protected loadWindow(win: BrowserWindow, url: string, options: WindowLoadOptions = {}): Promise<void> {
    const { event = 'did-finish-load', timeoutMs = 60_000, readyDelayMs = 0, signal } = options
    signal?.throwIfAborted()
    if (win.isDestroyed()) return Promise.reject(new Error('窗口已关闭'))
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
        wc.removeListener('render-process-gone', crashed)
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
      const ready = () => { readyTimer = setTimeout(() => finish(), readyDelayMs) }
      const failed = (_event: unknown, code: number, description: string, _url: string, isMainFrame: boolean) => {
        if (isMainFrame && code !== -3 && !(options.allowHttpErrorPage && code === -379)) finish(new Error(description))
      }
      const closed = () => finish(new Error('窗口已关闭'))
      const crashed = () => finish(new Error('窗口渲染进程退出'))
      const abort = () => {
        finish(signal?.reason ?? new TaskCancelledError())
        if (!wc.isDestroyed()) wc.stop()
      }
      const deadline = setTimeout(() => finish(new Error('页面加载超时')), timeoutMs)
      if (event === 'dom-ready') wc.once('dom-ready', ready)
      else wc.once('did-finish-load', ready)
      wc.on('did-fail-load', failed)
      wc.once('render-process-gone', crashed)
      win.once('closed', closed)
      signal?.addEventListener('abort', abort, { once: true })
      try {
        void win.loadURL(url).catch(error => {
          if (!(options.allowHttpErrorPage && error?.errno === -379)) finish(error)
        })
      } catch (error) {
        finish(error)
      }
    })
  }

  async getDomain() {
    if (!this.browserWindow || this.browserWindow.isDestroyed()) return ''
    return new URL(this.browserWindow.webContents.getURL()).origin
  }

  async getHTML(signal?: AbortSignal) {
    signal?.throwIfAborted()
    const win = this.browserWindow
    if (!win || win.isDestroyed()) return { html: undefined, domain: '' }
    const wc = win.webContents
    const html = await wc.executeJavaScript('document.documentElement.outerHTML')
    signal?.throwIfAborted()
    return { html, domain: new URL(wc.getURL()).origin }
  }

  protected async scrollWindow(viewportRatio = 0.8, durationMs = 3000) {
    if (!this.browserWindow || this.browserWindow.isDestroyed()) return false
    const result = await this.browserWindow.webContents.executeJavaScript(`(() => {
      return new Promise(resolve => {
        const startY = window.scrollY;
        const height = window.innerHeight;
        const bottom = document.documentElement.scrollHeight - height;
        if (startY >= bottom - 10) { resolve(false); return; }
        const targetY = Math.min(startY + Math.floor(height * ${JSON.stringify(viewportRatio)}), bottom);
        const startTime = performance.now();
        function step(now) {
          const progress = Math.min((now - startTime) / ${JSON.stringify(durationMs)}, 1);
          const ease = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
          window.scrollTo(0, startY + (targetY - startY) * ease);
          if (progress < 1) requestAnimationFrame(step);
          else resolve(true);
        }
        requestAnimationFrame(step);
      });
    })()`)
    return result === true
  }

  /** 在页面登录会话内请求 JSON，取消时中止对应的 renderer fetch。 */
  protected async fetchPage(url: string, signal?: AbortSignal): Promise<PageResponse> {
    signal?.throwIfAborted()
    const win = this.browserWindow
    if (!win || win.isDestroyed()) throw new Error('窗口已关闭')
    const wc = win.webContents
    const id = JSON.stringify(randomUUID())
    const abort = () => {
      if (!wc.isDestroyed())
        void wc.executeJavaScript(`window.__serviceRequests?.get(${id})?.abort()`).catch(() => undefined)
    }
    signal?.addEventListener('abort', abort, { once: true })
    try {
      const result = await wc.executeJavaScript(`(async () => {
        const requests = window.__serviceRequests ||= new Map();
        const controller = new AbortController();
        requests.set(${id}, controller);
        try {
          const response = await fetch(${JSON.stringify(url)}, { credentials: 'include', signal: controller.signal });
          const contentType = response.headers.get('content-type') || '';
          const text = await response.text();
          let data = text;
          if (contentType.includes('json')) {
            try { data = JSON.parse(text); }
            catch (error) { if (response.ok) throw error; }
          }
          return { success: response.ok, status: response.status, contentType, url: response.url, redirected: response.redirected, data };
        } finally { requests.delete(${id}); }
      })()`)
      signal?.throwIfAborted()
      return result
    } finally {
      signal?.removeEventListener('abort', abort)
    }
  }

  protected releaseWindow() {
    const win = this.browserWindow
    this.browserWindow = null
    this.detachLifecycle?.()
    this.detachLifecycle = undefined
    if (win && !win.isDestroyed()) win.destroy()
  }

  destroy() {
    this.closeHandle = null
    this.releaseWindow()
  }
}
