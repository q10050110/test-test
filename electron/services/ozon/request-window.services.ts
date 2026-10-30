import type { Session } from 'electron'
import { BrowserWindowService, type PageResponse } from '../common/browser-window.services.js'
import { MAX_SLIDER_ATTEMPTS, SliderVerificationService } from '../common/slider-verification.services.js'
import { verificationCoordinator, VerificationFailedError } from '../common/verification-coordinator.services.js'
import { TaskScope, TaskCancelledError, abortableDelay } from '../common/task-scope.services.js'
import log from '../../log/index.js'

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

/** 同 Session、同来源共享的隐藏请求窗口，串行执行所有任务的接口请求。 */
export class OzonRequestWindowService extends BrowserWindowService {
  private readonly scope = new TaskScope()
  private tail: Promise<void> = Promise.resolve()
  private readonly slider: Pick<SliderVerificationService, 'prepare' | 'hasChallenge' | 'verify'>
  private readonly origin: string
  private pending = 0

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
    const previous = this.tail
    const emit = (state: VerificationState) => this.emit(state, onState)
    if (this.pending++) emit({ phase: 'waiting' })
    let finished = false
    const abort = () => { if (!finished) this.releaseWindow() }
    const result = scope.run(async () => {
      await scope.run(() => previous, 0)
      scope.check()
      combined.addEventListener('abort', abort, { once: true })
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
      } finally {
        finished = true
        combined.removeEventListener('abort', abort)
      }
    }, 0)
    const settled = result.then(() => undefined, () => undefined)
    this.tail = previous.then(() => settled)
    return result.finally(() => { this.pending--; scope.stop() })
  }

  protected async ensureWindow(signal: AbortSignal) {
    if (this.browserWindow && !this.browserWindow.isDestroyed()) return
    const win = this.createBrowserWindow({ show: true, webPreferences: { session: this.session } })
    try {
      await this.navigate(this.entryUrl, signal)
      signal.throwIfAborted()
      if (win.isDestroyed()) throw new Error('OZON 请求窗口已关闭')
    } catch (error) {
      if (this.browserWindow === win) this.releaseWindow()
      throw error
    }
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
