import { BrowserWindow } from 'electron'
import log from '../../log/index.js'

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
  createCollectionWindow(url: string) {
    return new Promise((resolve, reject) => {
      let settled = false
      const safeResolve = (v: any) => {
        if (settled) return
        settled = true
        resolve(v)
      }
      const safeReject = (e: any) => {
        if (settled) return
        settled = true
        reject(e)
      }
      this.browserWindow = new BrowserWindow({
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
      this.browserWindow.webContents.openDevTools()
      const timeoutId = setTimeout(() => {
        if (this.browserWindow) {
          this.destroy()
        }
        safeReject('页面加载超时')
      }, 100000)

      // 监听页面加载完成事件
      this.browserWindow.webContents.once('dom-ready', async () => {
        log.info('页面 DOM 已准备就绪')
        clearTimeout(timeoutId)
        await new Promise((resolve) => setTimeout(resolve, 3000))
        safeResolve(this.browserWindow)
      })

      // 监听窗口关闭事件
      this.browserWindow.once('closed', () => {
        this.closeHandle && this.closeHandle()
      })

      this.browserWindow.loadURL(url)
    })
  }

  /**
   * 获取页面
   */
  async getHTML() {
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
      if (result?.ok) await new Promise((resolve) => setTimeout(resolve, 2000))
    }

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
  async getSellingData(requestUrl: string) {
    if (!this.browserWindow || this.browserWindow.isDestroyed()) return
    try {
      const response = await this.browserWindow.webContents.executeJavaScript(`
            fetch(${JSON.stringify(requestUrl)}, { credentials: 'include' })
            .then(response => response.json())
            .then(data => ({ success: true, data: data }))
          `)
      return response
    } catch (error) {
      return false
    }
  }

  /**
   * 改变当前窗口 URL
   */
  async changeUrl(url: string, waitForLoad = true) {
    if (!this.browserWindow || this.browserWindow.isDestroyed()) {
      throw new Error('窗口不存在或已销毁')
    }
    console.log('改变当前窗口URL')
    const win = this.browserWindow

    if (!waitForLoad) {
      await win.loadURL(url)
      return true
    }

    return new Promise((resolve, reject) => {
      let settled = false

      const safeResolve = (v: any) => {
        if (settled) return
        settled = true
        resolve(v)
      }

      const safeReject = (e: any) => {
        if (settled) return
        settled = true
        reject(e)
      }

      const timeout = setTimeout(() => {
        safeReject('URL 切换超时')
      }, 60000)

      win.webContents.once('did-finish-load', () => {
        clearTimeout(timeout)
        safeResolve(true)
      })

      win.webContents.once('did-fail-load', (_, errorCode, errorDesc) => {
        clearTimeout(timeout)
        safeReject(`加载失败: ${errorDesc} (${errorCode})`)
      })

      win.loadURL(url)
    })
  }

  /**
   * 关闭采集窗口
   */
  async destroy() {
    this.browserWindow?.destroy()
    this.browserWindow = null
    this.closeHandle = null
  }
}
