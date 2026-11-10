import path from 'node:path'
import { BrowserWindow, ipcMain } from 'electron'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import type { ParseService } from './parse.services.js'
import { TaskCancelledError, TaskScope, abortableDelay } from '../common/task-scope.services.js'
import log from '../../log/business.js'
const directory = path.dirname(fileURLToPath(import.meta.url))

interface SourceSearchContext {
  taskId?: string
  goodsId?: string
  onStage?: (stage: string) => void
}
interface SourceSearchOptions {
  entryTimeoutMs?: number
  imageTimeoutMs?: number
  uploadTimeoutMs?: number
  resultTimeoutMs?: number
  readTimeoutMs?: number
  pollMs?: number
  sortDelayMs?: number
}

export class WindowService {
  private readonly windows = new Map<string, () => void>()
  constructor(private readonly parseService: ParseService, private readonly options: SourceSearchOptions = {}) {}

  async createWindow(sourceType: string, cover: string, signal?: AbortSignal, context?: SourceSearchContext): Promise<any> {
    const scope = new TaskScope(signal)
    try {
      return await scope.run((signal) => this.open(sourceType, cover, signal, context), 120_000, '1688 图搜')
    } finally {
      scope.stop()
    }
  }

  private open(sourceType: string, cover: string, signal: AbortSignal, context?: SourceSearchContext): Promise<any> {
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
      let searchStarted = false
      let resultsStarted = false
      let stage = ''
      let stageTimer: NodeJS.Timeout | undefined
      const started = performance.now()
      const cleanup = () => {
        clearTimeout(stageTimer)
        signal.removeEventListener('abort', abort)
        ipcMain.removeListener(channel, received)
        win.removeListener('closed', closed)
        if (!wc.isDestroyed()) {
          wc.removeListener('render-process-gone', crashed)
          wc.removeListener('dom-ready', ready)
        }
        this.windows.delete(id)
        if (!win.isDestroyed()) win.destroy()
      }
      const finish = (error?: unknown, value?: any) => {
        if (settled) return
        settled = true
        if (error) log.warn('1688 图搜失败:', {
          taskId: context?.taskId, goodsId: context?.goodsId, windowId: id, stage,
          elapsedMs: Math.round(performance.now() - started), error,
        })
        try {
          cleanup()
        } catch (cleanupError) {
          error ??= cleanupError
        }
        if (error) reject(error)
        else resolve(value)
      }
      const setStage = (next: string, timeoutMs: number) => {
        if (settled) return
        clearTimeout(stageTimer)
        stage = next
        log.info('1688 图搜阶段:', {
          taskId: context?.taskId, goodsId: context?.goodsId, windowId: id, stage,
          elapsedMs: Math.round(performance.now() - started),
        })
        try { context?.onStage?.(stage) }
        catch (error) { log.warn('通知1688图搜阶段失败:', error) }
        if (!settled) stageTimer = setTimeout(() => finish(new Error(`1688 ${stage}超时`)), timeoutMs)
      }
      const readResults = () => {
        if (settled || resultsStarted) return
        resultsStarted = true
        ipcMain.removeListener(channel, received)
        setStage('等待结果商品', this.options.resultTimeoutMs ?? 30_000)
        void (async () => {
          // URL/IPC 只是提示；直接检测结果卡片，丢失 preload 通知也可继续。
          await this.waitForResults(win, signal)
          setStage('排序并读取结果', this.options.readTimeoutMs ?? 15_000)
          if (sourceType !== '0') {
            const sortText = sourceType === '1' ? '价格' : '销量'
            await win.webContents.executeJavaScript(
              '(function () { const text = ' +
                JSON.stringify(sortText) +
                '; for (const el of document.querySelectorAll(".sortItem--X1Plgn6V")) { if (el.textContent === text) { el.click(); break; } } })()',
            )
            await abortableDelay(this.options.sortDelayMs ?? 2000, signal)
            await this.waitForResults(win, signal)
          }
          signal.throwIfAborted()
          const html = await win.webContents.executeJavaScript('document.documentElement.outerHTML')
          const result = await this.parseService['1688Parse'](html)
          signal.throwIfAborted()
          finish(undefined, result)
        })().catch(error => finish(error))
      }
      const abort = () => finish(signal.reason ?? new TaskCancelledError())
      const closed = () => finish(new Error('1688 窗口异常关闭'))
      const crashed = () => finish(new Error('1688 渲染进程退出'))
      const ready = () => {
        if (settled || searchStarted) return
        searchStarted = true
        wc.removeListener('dom-ready', ready)
        log.info('1688 图搜阶段耗时:', { windowId: id, stage: '入口DOM就绪', elapsedMs: Math.round(performance.now() - started) })
        setStage('下载源图', this.options.imageTimeoutMs ?? 12_000)
        void this.startSearch(win, cover, signal, () => {
          setStage('上传图片并搜索', this.options.uploadTimeoutMs ?? 15_000)
        }).then(readResults, error => {
          // 搜索触发导航后旧 JS 上下文可能退出；已进入结果读取时由该阶段负责收尾。
          if (!resultsStarted) finish(error)
        })
      }
      const received = (event: Electron.IpcMainEvent) => {
        if (event.sender !== wc || settled) return
        log.info('1688 图搜阶段耗时:', { windowId: id, stage: '收到搜索结果', elapsedMs: Math.round(performance.now() - started) })
        readResults()
      }
      this.windows.set(id, () => finish(new TaskCancelledError('1688 窗口已回收')))
      signal.addEventListener('abort', abort, { once: true })
      win.once('closed', closed)
      win.webContents.once('render-process-gone', crashed)
      wc.once('dom-ready', ready)
      ipcMain.on(channel, received)
      setStage('加载入口页', this.options.entryTimeoutMs ?? 30_000)
      void win
        .loadURL('https://pages-fast.1688.com/wow/cbu/srch_rec/image_search/youyuan/index.html?')
        // DOM 就绪即可上传；图片、统计等资源不能阻塞整个商品处理槽。
        .catch((error) => { if (!searchStarted || error?.errno !== -3) finish(error) })
    })
  }

  private async waitForResults(win: BrowserWindow, signal: AbortSignal) {
    const scope = new TaskScope(signal)
    try {
      while (true) {
        scope.check()
        if (win.isDestroyed()) throw new Error('1688 窗口已关闭')
        try {
          const ready = await scope.run(() => win.webContents.executeJavaScript(`(() => {
            const layout = document.querySelector('.offerListLayoutWrapper--qlAH8LJK');
            return Array.from(layout?.children || []).some(card =>
              card.getAttribute('data-renderkey') && !card.querySelector('.mainImgIcon--GzUD_qpZ') &&
              /\\d/.test(card.querySelector('.offer-price-row')?.textContent || ''));
          })()`), 0)
          if (ready === true) return
        } catch (error) {
          scope.check()
          if (!/context.*destroy|navigat|ERR_ABORTED/i.test(String(error))) throw error
        }
        await scope.sleep(this.options.pollMs ?? 250)
      }
    } finally { scope.stop() }
  }

  private async loadSourceImage(win: BrowserWindow, cover: string, signal: AbortSignal) {
    const scope = new TaskScope(signal)
    const started = performance.now()
    try {
      return await scope.run(async inner => {
        const response = await win.webContents.session.fetch(cover, { signal: inner, credentials: 'include' })
        if (!response.ok) throw new Error(`读取1688图搜源图失败：HTTP ${response.status}`)
        const mime = response.headers.get('content-type')?.split(';')[0]?.trim()
        if (!mime?.startsWith('image/')) throw new Error('1688图搜源图响应不是图片')
        const bytes = Buffer.from(await response.arrayBuffer())
        inner.throwIfAborted()
        if (!bytes.length) throw new Error('1688图搜源图内容为空')
        return { base64: bytes.toString('base64'), mime }
      }, 10_000, '读取1688图搜源图')
    } finally {
      scope.stop()
      log.info('1688 源图下载耗时:', { elapsedMs: Math.round(performance.now() - started) })
    }
  }

  private async startSearch(win: BrowserWindow, cover: string, signal: AbortSignal, onUpload?: () => void) {
    // 会话下载不受 1688 页面跨域 fetch 限制，并与原有入口等待重叠。
    const [image] = await Promise.all([
      this.loadSourceImage(win, cover, signal), abortableDelay(2000, signal),
    ])
    signal.throwIfAborted()
    onUpload?.()
    await win?.webContents?.executeJavaScript(`
          new Promise(async (resolve, reject) => {
            try {
              // 主进程已在同一 Session 下载图片，页面只负责上传。
              const binary = atob(${JSON.stringify(image.base64)});
              const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
              const imageBlob = new Blob([bytes], { type: ${JSON.stringify(image.mime)} });

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
              const file = new File([imageBlob], 'search-image.jpg', { type: ${JSON.stringify(image.mime)} });
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

              // 立即返回主进程，由结果卡片检测等待加载，避免导航销毁旧 Promise 上下文。
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
