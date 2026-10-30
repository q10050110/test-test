import type { Session } from 'electron'
import { OzonRequestWindowService, type VerificationState } from './request-window.services.js'
import { TaskCancelledError } from '../common/task-scope.services.js'

interface SharedRequests {
  worker: OzonRequestWindowService
  users: number
}

const sessions = new WeakMap<Session, Map<string, SharedRequests>>()

/** 任务只持有使用权；取消和销毁任务不会终止其他任务的请求。 */
export function acquireOzonRequests(session: Session, entryUrl: string, onState?: (state: VerificationState) => void) {
  const origin = new URL(entryUrl).origin
  let sites = sessions.get(session)
  if (!sites) sessions.set(session, sites = new Map())
  let shared = sites.get(origin)
  if (!shared) {
    shared = { worker: new OzonRequestWindowService(session, entryUrl), users: 0 }
    sites.set(origin, shared)
  }
  const entry = shared
  const owners = sites
  const controller = new AbortController()
  entry.users++
  return {
    request(url: string, signal?: AbortSignal) {
      controller.signal.throwIfAborted()
      // 异常关闭使旧队列全部退出；后续请求仍可创建新的共享窗口。
      if (entry.worker.stopped) {
        entry.worker.destroy()
        entry.worker = new OzonRequestWindowService(session, entryUrl)
      }
      return entry.worker.request(url, signal ? AbortSignal.any([signal, controller.signal]) : controller.signal, onState)
    },
    release() {
      if (controller.signal.aborted) return
      controller.abort(new TaskCancelledError('OZON 任务请求已取消'))
      if (--entry.users === 0) {
        owners.delete(origin)
        entry.worker.destroy()
      }
    },
  }
}
