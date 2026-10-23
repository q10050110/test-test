import path from 'node:path'
import { BrowserWindow, ipcMain } from 'electron'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import type { ParseService } from './parse.services.js'
import { TaskCancelledError, TaskScope, abortableDelay } from './task-scope.js'
const directory = path.dirname(fileURLToPath(import.meta.url))

export class WindowService {
  private readonly windows = new Map<string, () => void>()
  constructor(private readonly parseService: ParseService) {}

  async createWindow(sourceType: string, cover: string, signal?: AbortSignal): Promise<any> {
    const scope = new TaskScope(signal)
    try {
      return await scope.run((signal) => this.open(sourceType, cover, signal), 120_000, '1688 图搜')
    } finally {
      scope.stop()
    }
  }

  private open(sourceType: string, cover: string, signal: AbortSignal): Promise<any> {
    signal.throwIfAborted()
    return new Promise((resolve, reject) => {
      const id = randomUUID()
      const channel = 'result-page-' + id
      const win = new BrowserWindow({
        width: 1200,
        height: 800,
        show: false,
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: false,
          preload: path.join(directory, '../../preloads/1688preload.js'),
          additionalArguments: ['--winId=' + id],
          backgroundThrottling: false,
        },
      })
      const wc = win.webContents
      let settled = false
      const cleanup = () => {
        signal.removeEventListener('abort', abort)
        ipcMain.removeListener(channel, received)
        win.removeListener('closed', closed)
        if (!wc.isDestroyed()) wc.removeListener('render-process-gone', crashed)
        this.windows.delete(id)
        if (!win.isDestroyed()) win.destroy()
      }
      const finish = (error?: unknown, value?: any) => {
        if (settled) return
        settled = true
        try {
          cleanup()
        } catch (cleanupError) {
          error ??= cleanupError
        }
        if (error) reject(error)
        else resolve(value)
      }
      const abort = () => finish(signal.reason ?? new TaskCancelledError())
      const closed = () => finish(new Error('1688 窗口异常关闭'))
      const crashed = () => finish(new Error('1688 渲染进程退出'))
      const received = (event: Electron.IpcMainEvent) => {
        if (event.sender !== wc || settled) return
        ipcMain.removeListener(channel, received)
        void (async () => {
          await abortableDelay(5000, signal)
          if (sourceType !== '0') {
            const sortText = sourceType === '1' ? '价格' : '销量'
            await win.webContents.executeJavaScript(
              '(function () { const text = ' +
                JSON.stringify(sortText) +
                '; for (const el of document.querySelectorAll(".sortItem--X1Plgn6V")) { if (el.textContent === text) { el.click(); break; } } })()',
            )
          }
          await abortableDelay(2000, signal)
          signal.throwIfAborted()
          const html = await win.webContents.executeJavaScript('document.documentElement.outerHTML')
          const result = await this.parseService['1688Parse'](html)
          signal.throwIfAborted()
          finish(undefined, result)
        })().catch((error) => finish(error))
      }
      this.windows.set(id, () => finish(new TaskCancelledError('1688 窗口已回收')))
      signal.addEventListener('abort', abort, { once: true })
      win.once('closed', closed)
      win.webContents.once('render-process-gone', crashed)
      ipcMain.on(channel, received)
      void win
        .loadURL('https://pages-fast.1688.com/wow/cbu/srch_rec/image_search/youyuan/index.html?')
        .then(() => this.startSearch(win, cover, signal))
        .catch((error) => finish(error))
    })
  }

  private async startSearch(win: BrowserWindow, cover: string, signal: AbortSignal) {
    await abortableDelay(2000, signal)
    await win?.webContents?.executeJavaScript(`
          new Promise(async (resolve, reject) => {
            try {
              // 获取图片 Blob
              const response = await fetch(${JSON.stringify(cover)});
              const imageBlob = await response.blob();

              // 查找上传输入框
              const uploadInput = document.querySelector('input[type="file"]') ||
                                 document.querySelector('[accept*="image"]') ||
                                 Array.from(document.querySelectorAll('input')).find(el => 
                                   el.type === 'file' || el.accept?.includes('image')
                                 );

              if (!uploadInput) {
                console.error('未找到文件上传输入框');
                reject(new Error('未找到上传输入框'));
                return;
              }

              // 创建 File 对象并模拟上传
              const file = new File([imageBlob], 'search-image.jpg', { type: 'image/jpeg' });
              const dataTransfer = new DataTransfer();
              dataTransfer.items.add(file);
              uploadInput.files = dataTransfer.files;

              // 触发 change 和 input 事件
              const changeEvent = new Event('change', { bubbles: true });
              uploadInput.dispatchEvent(changeEvent);
              const inputEvent = new Event('input', { bubbles: true });
              uploadInput.dispatchEvent(inputEvent);

              // 等待图片预览加载
              await new Promise(r => setTimeout(r, 2000));

              // 查找并点击搜索按钮
              const searchButton = document.querySelector('[data-tracker="pasteImagePreview"]') ||
                                  document.querySelector('.search-btn') ||
                                  document.querySelector('[class*="search-btn"]') ||
                                  Array.from(document.querySelectorAll('div, button')).find(el => 
                                    el.textContent?.includes('搜索图片') || 
                                    el.textContent?.includes('搜索') ||
                                    el.getAttribute('data-tracker') === 'pasteImagePreview'
                                  );

              if (!searchButton) {
                console.error('未找到搜索按钮');
                reject(new Error('未找到搜索按钮'));
                return;
              }

              searchButton.click();

              // 等待页面跳转和结果加载
              await new Promise(r => setTimeout(r, 3000));
              resolve({ success: true, message: '图片上传并搜索成功' });
            } catch (error) {
              reject(error);
            }
          });
        `)
    signal.throwIfAborted()
  }

  destroy() {
    for (const cancel of [...this.windows.values()]) cancel()
    this.windows.clear()
  }
}
