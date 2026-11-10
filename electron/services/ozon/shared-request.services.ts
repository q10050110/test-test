import type { Session } from 'electron'
import { OzonRequestWindowService, type VerificationState } from './request-window.services.js'
import { TaskCancelledError } from '../common/task-scope.services.js'
import log from '../../log/business.js'

let nextOwnerId = 0

interface SharedRequests {
  worker: OzonRequestWindowService
  users: number
  active: number
}

const sessions = new WeakMap<Session, Map<string, SharedRequests>>()

/** 任务只持有使用权；取消和销毁任务不会终止其他任务的请求。 */
export function acquireOzonRequests(session: Session, entryUrl: string, onState?: (state: VerificationState) => void) {
  const origin = new URL(entryUrl).origin
  let sites = sessions.get(session)
  if (!sites) sessions.set(session, sites = new Map())
  let shared = sites.get(origin)
  if (!shared) {
    shared = {
      worker: new OzonRequestWindowService(session, entryUrl), users: 0, active: 0,
    }
    sites.set(origin, shared)
  }
  const entry = shared
  const owners = sites
  const controller = new AbortController()
  let ownerActive = 0
  const ownerId = ++nextOwnerId
  entry.users++
  return {
    request(url: string, signal?: AbortSignal) {
      controller.signal.throwIfAborted()
      const combined = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal
      const started = performance.now()
      entry.active++
      ownerActive++
      return (async () => {
        try {
          // 直接委托，不按任务排队；只在验证码恢复时由验证协调器暂停网络。
          if (entry.worker.stopped) {
            entry.worker.destroy()
            entry.worker = new OzonRequestWindowService(session, entryUrl)
          }
          return await entry.worker.request(url, combined, onState)
        } finally {
          entry.active--
          ownerActive--
          log.info('OZON 委托请求耗时:', {
            ownerId, origin, url, elapsedMs: Math.round(performance.now() - started),
            active: entry.active, ownerActive,
          })
        }
      })()
    },
    getStats: () => ({ active: entry.active, ownerActive, users: entry.users }),
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
