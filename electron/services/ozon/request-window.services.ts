import type { Session } from 'electron'
import { BrowserWindowService, type PageResponse } from '../common/browser-window.services.js'
import { MAX_SLIDER_ATTEMPTS, SliderVerificationService } from '../common/slider-verification.services.js'
import { verificationCoordinator, VerificationFailedError } from '../common/verification-coordinator.services.js'
import { TaskScope, TaskCancelledError, abortableDelay } from '../common/task-scope.services.js'
import log from '../../log/business.js'

export class OzonVerificationError extends VerificationFailedError {
  constructor() { super('OZON 验证恢复失败，已达到 3 次尝试上限'); this.name = 'OzonVerificationError' }
}
export type VerificationState = { phase: 'waiting' | 'verifying' | 'retrying' | 'ready' | 'failed'; attempt?: number }
interface Options {
  slider?: Pick<SliderVerificationService, 'prepare' | 'hasChallenge' | 'verify'>
  requestTimeoutMs?: number
  loadTimeoutMs?: number
  settleMs?: number
}

/** 同 Session、同来源共享请求窗口；正常请求并发，验证恢复由协调器独占。 */
export class OzonRequestWindowService extends BrowserWindowService {
  private readonly scope = new TaskScope()
  private windowReady?: Promise<void>
  private readonly slider: Pick<SliderVerificationService, 'prepare' | 'hasChallenge' | 'verify'>
  private readonly origin: string

  constructor(
    private readonly session: Session,
    private readonly entryUrl: string,
    private readonly onState?: (state: VerificationState) => void,
    private readonly options: Options = {},
  ) {
    super(() => this.scope.stop(new Error('OZON 请求窗口异常关闭')))
    this.origin = new URL(entryUrl).origin
    this.slider = options.slider ?? new SliderVerificationService()
  }

  get stopped() { return this.scope.signal.aborted }

  request(url: string, signal?: AbortSignal, onState = this.onState): Promise<PageResponse> {
    if (new URL(url).origin !== this.origin) return Promise.reject(new Error('请求地址与 OZON 会话来源不一致'))
    const combined = signal ? AbortSignal.any([signal, this.scope.signal]) : this.scope.signal
    const scope = new TaskScope(combined)
    const emit = (state: VerificationState) => this.emit(state, onState)
    const result = scope.run(async () => {
      scope.check()
      try {
        let response = await verificationCoordinator.request(this.session, this.origin, async () => {
          await this.ensureWindow(scope.signal)
          return this.fetch(url, scope.signal)
        }, scope.signal, () => emit({ phase: 'waiting' }))
        if (this.needsRecovery(response)) {
          emit({ phase: 'waiting' })
          let recovered: PageResponse | undefined
          await verificationCoordinator.recover(this.session, this.origin, async () => {
            recovered = await this.recover(url, response, scope.signal, emit)
          }, scope.signal)
          scope.check()
          response = recovered ?? await verificationCoordinator.request(this.session, this.origin,
            async () => { await this.ensureWindow(scope.signal); return this.fetch(url, scope.signal) }, scope.signal,
            () => emit({ phase: 'waiting' }))
          if (this.needsRecovery(response)) throw new OzonVerificationError()
        }
        if (!this.isData(response)) throw new Error(`OZON 接口返回异常：HTTP ${response.status}，${response.contentType}`)
        emit({ phase: 'ready' })
        return response
      } catch (error) {
        emit({ phase: 'failed' })
        throw error
      }
    }, 0)
    return result.finally(() => scope.stop())
  }

  protected async ensureWindow(signal: AbortSignal) {
    signal.throwIfAborted()
    if (!this.windowReady) {
      if (this.browserWindow && !this.browserWindow.isDestroyed()) return
      const win = this.createBrowserWindow({ show: true, webPreferences: { session: this.session } })
      // 初始化属于共享服务，单个请求取消不能中止其他请求正在等待的页面加载。
      const ready = this.navigate(this.entryUrl, this.scope.signal).then(() => {
        this.scope.check()
        if (win.isDestroyed()) throw new Error('OZON 请求窗口已关闭')
      }).catch(error => {
        if (this.browserWindow === win) this.releaseWindow()
        throw error
      }).finally(() => {
        if (this.windowReady === ready) this.windowReady = undefined
      })
      this.windowReady = ready
      // 所有等待者都取消后，加载仍可能失败；避免留下无人处理的拒绝。
      void ready.catch(() => undefined)
    }
    const ready = this.windowReady
    const scope = new TaskScope(signal)
    try { await scope.run(() => ready, 0) }
    finally { scope.stop() }
  }

  protected async navigate(url: string, signal: AbortSignal) {
    const win = this.browserWindow
    if (!win || win.isDestroyed()) throw new Error('OZON 请求窗口已关闭')
    await this.loadWindow(win, url, {
      event: 'dom-ready', timeoutMs: this.options.loadTimeoutMs ?? 30_000,
      readyDelayMs: this.options.settleMs ?? 1000, allowHttpErrorPage: true, signal,
    })
  }

  private async fetch(url: string, signal: AbortSignal) {
    const scope = new TaskScope(signal)
    try { return await scope.run(inner => this.fetchPage(url, inner), this.options.requestTimeoutMs ?? 30_000, 'OZON 接口请求') }
    finally { scope.stop() }
  }

  private isData(response: PageResponse) {
    return response.success && response.contentType.includes('json') && response.data !== null && typeof response.data === 'object'
  }

  private needsRecovery(response: PageResponse) {
    return response.status === 403 || response.contentType.includes('text/html')
  }

  private async recover(url: string, initial: PageResponse, signal: AbortSignal, emit: (state: VerificationState) => void): Promise<PageResponse> {
    let response = initial
    for (let attempt = 1; attempt <= MAX_SLIDER_ATTEMPTS; attempt++) {
      signal.throwIfAborted()
      emit({ phase: 'verifying', attempt })
      try {
        const redirect = response.redirected && response.url !== url && new URL(response.url).origin === this.origin
        if (redirect && this.browserWindow && !this.browserWindow.isDestroyed()) await this.navigate(response.url, signal)
        else {
          this.releaseWindow()
          await this.ensureWindow(signal)
        }
        const wc = this.browserWindow!.webContents
        await this.slider.prepare(wc, signal)
        if (await this.slider.hasChallenge(wc, signal)) {
          const result = await this.slider.verify(wc, signal)
          log.info('请求窗口滑块拖动结果:', { attempt, ...result })
          await abortableDelay(this.options.settleMs ?? 1000, signal)
        }
        emit({ phase: 'retrying', attempt })
        response = await this.fetch(url, signal)
        if (this.isData(response)) return response
        if (!this.needsRecovery(response)) throw new Error(`OZON 接口返回 HTTP ${response.status}`)
      } catch (error) {
        signal.throwIfAborted()
        log.warn('OZON 验证恢复尝试失败:', { attempt, error })
      }
    }
    throw new OzonVerificationError()
  }

  private emit(state: VerificationState, onState?: (state: VerificationState) => void) {
    try { onState?.(state) }
    catch (error) { log.warn('通知验证状态失败:', error) }
  }

  override destroy() {
    this.scope.stop(new TaskCancelledError('OZON 请求窗口已回收'))
    super.destroy()
  }
}
