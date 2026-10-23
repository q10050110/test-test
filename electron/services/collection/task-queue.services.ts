import {
  BehaviorSubject,
  EMPTY,
  Subject,
  Subscription,
  catchError,
  defer,
  filter,
  finalize,
  firstValueFrom,
  mergeMap,
  take,
} from 'rxjs'
import { TaskCancelledError, TaskScope } from './task-scope.js'

export type TaskHandler<T = any> = (task: T, signal: AbortSignal) => Promise<unknown>
export interface QueueOptions {
  parent?: AbortSignal
  timeoutMs?: number
  onError?: (error: unknown) => void
}

/** mergeMap 管理并发；退订丢弃缓冲任务，并终止活跃任务。完成商品只保留计数。 */
export class TaskQueueService<T extends { id: string } = any> {
  private readonly input$ = new Subject<T>()
  private readonly size$ = new BehaviorSubject(0)
  private readonly pending = new Set<string>()
  private readonly active = new Set<string>()
  private readonly scope: TaskScope
  private readonly subscription: Subscription
  private stopped = false
  private completed = 0
  private failed = 0

  constructor(handler: TaskHandler<T>, concurrency = 3, options: QueueOptions = {}) {
    this.scope = new TaskScope(options.parent)
    this.subscription = this.input$
      .pipe(
        mergeMap(
          (task) =>
            defer(async () => {
              this.pending.delete(task.id)
              this.active.add(task.id)
              this.publish()
              await this.scope.run(
                (signal) => handler(task, signal),
                options.timeoutMs ?? 120_000,
                '商品处理',
              )
              this.completed++
            }).pipe(
              catchError((error) => {
                if (!this.scope.signal.aborted) {
                  this.failed++
                  options.onError?.(error)
                }
                return EMPTY
              }),
              finalize(() => {
                this.active.delete(task.id)
                this.publish()
              }),
            ),
          concurrency,
        ),
      )
      .subscribe()
    if (options.parent) {
      const stop = () => this.destroy()
      options.parent.addEventListener('abort', stop, { once: true })
      this.subscription.add(() => options.parent?.removeEventListener('abort', stop))
      if (options.parent.aborted) this.destroy()
    }
  }

  addTask(tasks: T[]) {
    if (this.stopped) return
    for (const task of tasks) {
      if (!task.id || this.pending.has(task.id) || this.active.has(task.id)) continue
      this.pending.add(task.id)
      this.publish()
      this.input$.next(task)
    }
  }

  startProcessing() {
    return this.whenIdle()
  }
  getTaskCount() {
    return this.pending.size
  }
  getActiveCount() {
    return this.active.size
  }
  getCompletedTasksCount() {
    return this.completed
  }
  getFailedTasksCount() {
    return this.failed
  }
  whenIdle(): Promise<unknown> {
    if (!this.pending.size && !this.active.size) return Promise.resolve()
    return firstValueFrom(
      this.size$.pipe(
        filter((size) => size === 0),
        take(1),
      ),
    )
  }

  destroy(_retainCompleted = false, _destroyHandler = true) {
    if (this.stopped) return
    this.stopped = true
    this.scope.stop(new TaskCancelledError('商品队列已关闭'))
    this.subscription.unsubscribe()
    this.input$.complete()
    this.pending.clear()
    this.active.clear()
    this.publish()
    this.size$.complete()
  }
  private publish() {
    this.size$.next(this.pending.size + this.active.size)
  }
}
