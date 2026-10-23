import { TaskScope } from './task-scope.services.js'

export class VerificationFailedError extends Error {}

class RecoveryOwnerCancelledError extends Error {}
interface Gate {
  active: number
  recovery?: Promise<void>
  idle: Set<() => void>
}

/** 正常请求可并行；同 Session、同站点恢复期间，暂停新请求并等待在途请求退出。 */
export class VerificationCoordinatorService {
  private readonly sessions = new WeakMap<object, Map<string, Gate>>()

  private gate(session: object, origin: string) {
    let sites = this.sessions.get(session)
    if (!sites) this.sessions.set(session, sites = new Map())
    let gate = sites.get(origin)
    if (!gate) sites.set(origin, gate = { active: 0, idle: new Set() })
    return gate
  }

  private async wait(promise: Promise<unknown>, signal: AbortSignal) {
    const scope = new TaskScope(signal)
    try { await scope.run(() => promise, 0) }
    finally { scope.stop() }
  }

  async request<T>(session: object, origin: string, operation: () => Promise<T>, signal: AbortSignal, onWaiting?: () => void): Promise<T> {
    const gate = this.gate(session, origin)
    while (gate.recovery) {
      onWaiting?.()
      try { await this.wait(gate.recovery, signal) }
      catch (error) { if (!(error instanceof RecoveryOwnerCancelledError)) throw error }
      signal.throwIfAborted()
    }
    signal.throwIfAborted()
    gate.active++
    const scope = new TaskScope(signal)
    try { return await scope.run(() => operation(), 0) }
    finally {
      scope.stop()
      gate.active--
      if (!gate.active) for (const idle of [...gate.idle]) idle()
    }
  }

  async recover(session: object, origin: string, operation: () => Promise<void>, signal: AbortSignal): Promise<void> {
    const gate = this.gate(session, origin)
    if (gate.recovery) {
      try { await this.wait(gate.recovery, signal); return }
      catch (error) {
        signal.throwIfAborted()
        if (error instanceof RecoveryOwnerCancelledError) return this.recover(session, origin, operation, signal)
        throw error
      }
    }
    let idle: (() => void) | undefined
    const scope = new TaskScope(signal)
    const recovery = Promise.resolve().then(async () => {
      try {
        await scope.run(() => gate.active ? new Promise<void>(resolve => {
          idle = resolve
          gate.idle.add(resolve)
        }) : undefined, 0)
        scope.check()
        await scope.run(() => operation(), 0)
      } catch (error) {
        if (signal.aborted) throw new RecoveryOwnerCancelledError('验证发起任务已取消')
        throw error
      } finally {
        if (idle) gate.idle.delete(idle)
        scope.stop()
        if (gate.recovery === recovery) gate.recovery = undefined
      }
    })
    gate.recovery = recovery
    // 单个等待者取消不能取消其他任务；也不能留下无人观察的拒绝。
    void recovery.catch(() => undefined)
    try { await this.wait(recovery, signal) }
    catch (error) { signal.throwIfAborted(); throw error }
  }
}

export const verificationCoordinator = new VerificationCoordinatorService()
