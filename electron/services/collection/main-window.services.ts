import { BrowserWindow, session } from 'electron';
import log from '../../log/index.js'
import * as cheerio from 'cheerio'

export class MainWindowService {
  private browserWindow: BrowserWindow | null = null
  private closeHandle: () => void
  constructor(closeHandle: () => void) {
    this.closeHandle = closeHandle
  }
  /** 
   * 创建采集窗口
  */
  createCollectionWindow(url: string,) {
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
        frame: false,
        webPreferences: {
          contextIsolation: true,
          sandbox: true,
          nodeIntegration: false,
          session: session.fromPartition(
            `persist:collect-${Date.now()}`, // 每次独立
            {
              cache: false, // 采集不需要缓存，避免脏数据
            }
          ),
          backgroundThrottling: false
        },
      });

      const timeoutId = setTimeout(() => {
        if (this.browserWindow) {
          this.closeCollectionWindow()
        }
        safeReject('页面加载超时')
      }, 100000);

      // 监听页面加载完成事件
      this.browserWindow.webContents.once('dom-ready', async () => {
        log.info('页面 DOM 已准备就绪');
        clearTimeout(timeoutId)
        await new Promise(resolve => setTimeout(resolve, 3000))
        safeResolve(this.browserWindow)
      });

      // 监听窗口关闭事件
      this.browserWindow.once('closed', () => {
        this.closeHandle && this.closeHandle()
      });

      this.browserWindow.loadURL(url);
    })
  }

  /**
   * 获取页面
    */
  async getHTML() {
    if (!this.browserWindow || this.browserWindow.isDestroyed()) return { $: undefined, domain: undefined }
    try {
      const html = await this.browserWindow.webContents.executeJavaScript('document.documentElement.outerHTML')
      const $ = cheerio.load(html)
      const domain = new URL(this.browserWindow.webContents.getURL()).origin
      return { $, domain }
    } catch (error) {
      throw new Error(error as string)
    }
  }
  /**
   * 滚动页面
    */
  async scrollPage() {
    if (!this.browserWindow || this.browserWindow.isDestroyed()) return false

    try {
      const result = await this.browserWindow.webContents.executeJavaScript(`  (function () {
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

      const duration = 600; // 滚动时长 ms
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
   * 关闭采集窗口
   */
  async closeCollectionWindow() {
    this.browserWindow?.destroy()
    this.browserWindow = null
  }
}