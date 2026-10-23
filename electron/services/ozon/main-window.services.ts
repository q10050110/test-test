import { BrowserWindowService } from '../common/browser-window.services.js'
import { SliderVerificationService } from '../common/slider-verification.services.js'
import { OzonRequestWindowService, type VerificationState } from './request-window.services.js'
import log from '../../log/index.js'
import { TaskScope } from '../common/task-scope.services.js'

/** OZON 业务窗口只读取页面；两个易受限接口委托给独立请求窗口。 */
export class OzonWindowService extends BrowserWindowService {
  private requests?: OzonRequestWindowService
  private readonly slider = new SliderVerificationService()

  constructor(onClosed: () => void, private readonly onVerification?: (state: VerificationState) => void) {
    super(onClosed)
  }

  async checkPage(signal?: AbortSignal) {
    if (this.browserWindow && !this.browserWindow.isDestroyed())
      await this.slider.checkPage(this.browserWindow.webContents, signal)
  }

  override async getHTML(signal?: AbortSignal) {
    const scope = new TaskScope(signal)
    try {
      await this.checkPage(scope.signal)
      return await scope.run(inner => super.getHTML(inner), 30_000, '读取业务页面')
    } finally { scope.stop() }
  }

  async getSellingData(url: string, signal?: AbortSignal) {
    signal?.throwIfAborted()
    if (!this.browserWindow || this.browserWindow.isDestroyed()) throw new Error('OZON 任务窗口已关闭')
    if (!this.requests) {
      const origin = new URL(url).origin
      const pageUrl = this.browserWindow.webContents.getURL()
      const entry = new URL(pageUrl).origin === origin ? pageUrl : origin + '/'
      this.requests = new OzonRequestWindowService(this.browserWindow.webContents.session, entry, state => {
        log.info('OZON 接口验证状态:', state)
        this.onVerification?.(state)
      })
    }
    return this.requests.request(url, signal)
  }

  getDataByApi(id: string, signal?: AbortSignal) {
    return this.getSellingData(`https://www.ozon.ru/api/entrypoint-api.bx/page/json/v2?url=%2Fproduct%2Flastik-dlya-obuvi-sredstvo-dlya-suhoy-chistki-obuvi-${encodeURIComponent(id)}`, signal)
  }

  override destroy() {
    this.requests?.destroy()
    this.requests = undefined
    super.destroy()
  }
}
