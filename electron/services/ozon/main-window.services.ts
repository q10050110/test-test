import { BrowserWindowService } from '../common/browser-window.services.js'
import { SliderVerificationService } from '../common/slider-verification.services.js'
import type { VerificationState } from './request-window.services.js'
import { acquireOzonRequests } from './shared-request.services.js'
import log from '../../log/business.js'
import { TaskScope } from '../common/task-scope.services.js'

/** 采集与巡查的业务窗口只读取页面；接口统一交给共享请求窗口。 */
export class OzonWindowService extends BrowserWindowService {
  private readonly requests = new Map<string, ReturnType<typeof acquireOzonRequests>>()
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
    const origin = new URL(url).origin
    let requests = this.requests.get(origin)
    if (!requests) {
      const pageUrl = this.browserWindow.webContents.getURL()
      const entry = new URL(pageUrl).origin === origin ? pageUrl : origin + '/'
      requests = acquireOzonRequests(this.browserWindow.webContents.session, entry, state => {
        this.onVerification?.(state)
      })
      this.requests.set(origin, requests)
    }
    return requests.request(url, signal)
  }

  getDataByApi(id: string, signal?: AbortSignal) {
    return this.getSellingData(`https://www.ozon.ru/api/entrypoint-api.bx/page/json/v2?url=%2Fproduct%2Flastik-dlya-obuvi-sredstvo-dlya-suhoy-chistki-obuvi-${encodeURIComponent(id)}`, signal)
  }

  override destroy() {
    for (const requests of this.requests.values()) requests.release()
    this.requests.clear()
    super.destroy()
  }
}
