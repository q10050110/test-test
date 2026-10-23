import {
  Observable,
  ReplaySubject,
  TimeoutError,
  firstValueFrom,
  takeUntil,
  timeout,
  timer,
} from 'rxjs'

export class TaskCancelledError extends Error {
  constructor(message = '任务已取消') {
    super(message)
    this.name = 'TaskCancelledError'
  }
}

export class TaskTimeoutError extends Error {
  constructor(label: string) {
    super(`${label}超时`)
    this.name = 'TaskTimeoutError'
  }
}

/** RxJS 退订释放计时器，AbortSignal 真正中止底层请求和窗口。 */
export class TaskScope {
  private readonly controller = new AbortController()
  private readonly stopped$ = new ReplaySubject<void>(1)
  private detachParent?: () => void
  constructor(parent?: AbortSignal) {
    if (parent) {
      const stop = () => this.stop(parent.reason)
      if (parent.aborted) stop()
      else {
        parent.addEventListener('abort', stop, { once: true })
        this.detachParent = () => parent.removeEventListener('abort', stop)
      }
    }
  }
  get signal() {
    return this.controller.signal
  }
  check() {
    this.signal.throwIfAborted()
  }
  stop(reason: unknown = new TaskCancelledError()) {
    if (this.signal.aborted) return
    this.controller.abort(reason)
    this.stopped$.next()
    this.stopped$.complete()
    this.detachParent?.()
    this.detachParent = undefined
  }
  async run<T>(
    operation: (signal: AbortSignal) => PromiseLike<T> | T,
    ms = 30_000,
    label = '操作',
  ): Promise<T> {
    this.check()
    const source$ = new Observable<T>((subscriber) => {
      const controller = new AbortController()
      Promise.resolve()
        .then(() => {
          controller.signal.throwIfAborted()
          return operation(controller.signal)
        })
        .then(
          (value) => {
            if (!subscriber.closed) {
              subscriber.next(value)
              subscriber.complete()
            }
          },
          (error) => subscriber.error(error),
        )
      return () => controller.abort(this.signal.reason ?? new TaskCancelledError('操作已结束'))
    })
    try {
      const bounded$ = ms > 0 ? source$.pipe(timeout(ms)) : source$
      return await firstValueFrom(bounded$.pipe(takeUntil(this.stopped$)))
    } catch (error) {
      this.check()
      if (error instanceof TimeoutError) throw new TaskTimeoutError(label)
      throw error
    }
  }
  async sleep(ms: number) {
    this.check()
    try {
      await firstValueFrom(timer(ms).pipe(takeUntil(this.stopped$)))
    } catch (error) {
      this.check()
      throw error
    }
    this.check()
  }
}

export function abortableDelay(ms: number, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted()
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timerId)
      signal?.removeEventListener('abort', abort)
    }
    const abort = () => {
      cleanup()
      reject(signal?.reason ?? new TaskCancelledError())
    }
    const timerId = setTimeout(() => {
      cleanup()
      resolve()
    }, ms)
    signal?.addEventListener('abort', abort, { once: true })
  })
}
