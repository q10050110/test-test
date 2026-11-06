import type { BrowserWindow } from 'electron'
import type { Inspection, TaskStatus, BatchSaveSellDataParams, SellListParams } from './type.js'
import type { InterfaceResult } from '../../types/index.js'
import type { MainWindowService } from './main-window.services.js'
import type { ParseService } from './parse.services.js'
import type { VerificationState } from '../ozon/request-window.services.js'
import { TaskScope, TaskCancelledError } from '../common/task-scope.services.js'
import { createInspectionActor } from './inspection-machine.services.js'

export interface InspectionDependencies {
  createServices(onClosed: () => void, onVerification: (state: VerificationState) => void): {
    main: Pick<MainWindowService, 'createCollectionWindow' | 'getHTML' | 'scrollPage' | 'destroy'>
    parse: Pick<ParseService, 'ozonListParser' | 'destroy'>
  }
  updateStatus(data: { taskId: string; status: TaskStatus }, signal?: AbortSignal): Promise<InterfaceResult<unknown>>
  saveBatch(data: BatchSaveSellDataParams, signal?: AbortSignal): Promise<InterfaceResult<{ sku: string; dataId: string }[]>>
  saveSellers(data: SellListParams, signal?: AbortSignal): Promise<InterfaceResult<unknown>>
  log: { info(...args: any[]): void; warn(...args: any[]): void; error(...args: any[]): void }
  metrics(data: any): void
  timing?: { operation?: number; status?: number; scroll?: number; run?: number }
}
export interface InspectionResult { status: TaskStatus; inspectedCount: number; followedCount: number; error?: string }
export class InspectionRunError extends Error {
  constructor(readonly result: InspectionResult) { super(result.error ?? '巡查未正常完成'); this.name = 'InspectionRunError' }
}

/** 一个实例对应一次运行；Promise 覆盖工作流、回收和状态同步。 */
export class InspectionServices {
  private readonly actor = createInspectionActor()
  private readonly scope = new TaskScope()
  private services?: ReturnType<InspectionDependencies['createServices']>
  private execution?: Promise<InspectionResult>
  private cleanupPromise?: Promise<void>
  private statusSync = Promise.resolve()
  private failure?: unknown
  private progress = { inspectedCount: 0, followedCount: 0 }
  constructor(private inspection: Inspection, private mainWindow: BrowserWindow | null, private readonly deps: InspectionDependencies) {}

  getTaskInfo(): Inspection {
    const snapshot = this.actor.getSnapshot()
    const phase = typeof snapshot.value === 'object' ? snapshot.value.running :
      snapshot.value === 'cleaning' && snapshot.context.outcome === 'cancelled' ? 'stopping' : snapshot.value
    return { ...this.inspection, ...this.progress, phase }
  }
  markPending() { this.setStatus('pending') }
  start(): Promise<InspectionResult> {
    if (this.execution) return this.execution
    if (!this.actor.getSnapshot().matches('idle')) return Promise.reject(new Error('巡查实例已释放，请新建实例'))
    this.actor.send({ type: 'START' })
    this.inspection.lastRunningTime = Date.now()
    this.setStatus('running')
    this.execution = this.execute()
    return this.execution
  }
  private async execute(): Promise<InspectionResult> {
    try {
      this.services = this.deps.createServices(this.closeHandle, state => {
        if (this.scope.signal.aborted) return
        this.inspection.verification = state
        this.outputLog(`接口验证：${state.phase}${state.attempt ? `（${state.attempt}/3）` : ''}`)
      })
      this.metrics('start')
      await this.scope.run(() => this.workflow(), this.deps.timing?.run ?? 0, '巡查任务')
      this.scope.check()
      this.actor.send({ type: 'FINISH' })
    } catch (error) { this.fail(error) }
    finally {
      await this.cleanup()
      this.actor.send({ type: 'CLEANED' })
      this.setStatus(this.actor.getSnapshot().context.outcome)
      await this.statusSync
      this.actor.stop()
      this.mainWindow = null
      this.metrics('cleanup')
    }
    const result = { ...this.progress, status: this.inspection.status,
      ...(this.failure ? { error: this.failure instanceof Error ? this.failure.message : String(this.failure) } : {}) }
    if (result.status !== 'completed') throw new InspectionRunError(result)
    return result
  }
  private async workflow() {
    await this.scope.run(signal => this.services!.main.createCollectionWindow(this.inspection.shopUrl, signal), 100_000, '创建巡查窗口')
    this.scope.check()
    this.actor.send({ type: 'READY' })
    this.outputLog('巡查窗口已就绪')
    let empty = 0, bottom = 0
    while (true) {
      const { html, domain } = await this.scope.run(signal => this.services!.main.getHTML(signal), 0, '读取巡查页面')
      const goods = await this.scope.run(signal => this.services!.parse.ozonListParser(html, domain, signal), 0, '解析巡查商品')
      this.scope.check()
      if (goods.length) await this.saveData(goods)
      empty = goods.length ? 0 : empty + 1
      if (empty >= 10 || bottom >= 3) break
      await this.scope.sleep(this.deps.timing?.scroll ?? 2000 + Math.random() * 2000)
      const moved = await this.scope.run(() => this.services!.main.scrollPage(), this.deps.timing?.operation ?? 30_000, '滚动巡查页面')
      bottom = moved ? 0 : bottom + 1
    }
  }
  private async saveData(goods: any[]) {
    this.actor.send({ type: 'SAVE' })
    const target = goods.map(item => ({ id: item.id, link: item.link, cover: item.cover, nameLabel: item.nameLabel,
      resMoney: item.price, followMinPrice: item.followMinPrice, followMaxPrice: item.followMaxPrice, sellerNumber: item.sellerNumber }))
    const response = await this.scope.run(signal => this.deps.saveBatch({ taskId: this.inspection._id, data: target }, signal), this.deps.timing?.operation ?? 30_000, '保存巡查商品')
    this.scope.check()
    if (response.code !== 0 || !Array.isArray(response.data)) throw new Error(response.message || '保存巡查商品失败')
    for (const item of goods) {
      const record = response.data.find(record => String(record.sku) === String(item.id))
      if (!record?.dataId) throw new Error(`商品 ${item.id} 未返回保存记录`)
      const sellers = item.followList ?? []
      for (let offset = 0; offset < sellers.length; offset += 500) {
        const saved = await this.scope.run(signal => this.deps.saveSellers({ dataId: record.dataId, items: sellers.slice(offset, offset + 500) }, signal), this.deps.timing?.operation ?? 30_000, '保存跟卖列表')
        this.scope.check()
        if (saved.code !== 0) throw new Error(saved.message || '保存跟卖列表失败')
      }
    }
    this.progress.inspectedCount += goods.length
    this.progress.followedCount += goods.filter(item => item.sellerNumber > 0).length
    this.actor.send({ type: 'SAVED' })
    this.outputLog(`已保存 ${goods.length} 个巡查商品`)
  }
  private fail(error: unknown) {
    if (!this.actor.getSnapshot().matches('running')) return
    this.failure = error
    this.actor.send({ type: 'FAIL' })
    this.scope.stop(error)
    this.deps.log.error('巡查任务失败:', error)
  }
  closeHandle = () => this.fail(new Error('巡查窗口异常关闭'))
  async stopTask() {
    const snapshot = this.actor.getSnapshot()
    if (snapshot.status === 'done') return
    if (snapshot.matches('cleaning')) { await this.execution?.catch(() => undefined); await this.cleanupPromise; await this.statusSync; return }
    this.failure = new TaskCancelledError()
    this.actor.send({ type: 'CANCEL' })
    this.outputLog('正在终止巡查任务')
    this.scope.stop(this.failure)
    if (this.execution) await this.execution.catch(() => undefined)
    else {
      await this.cleanup()
      this.actor.send({ type: 'CLEANED' })
      this.setStatus('cancelled')
      await this.statusSync
      this.actor.stop()
      this.mainWindow = null
    }
  }
  private cleanup(): Promise<void> {
    if (this.cleanupPromise) return this.cleanupPromise
    this.inspection.verification = undefined
    this.outputLog('正在回收巡查资源')
    this.scope.stop()
    this.cleanupPromise = (async () => {
      for (const release of [() => this.services?.main.destroy(), () => this.services?.parse.destroy()]) {
        try { await release() }
        catch (error) {
          this.deps.log.error('回收巡查资源失败:', error)
          if (this.actor.getSnapshot().context.outcome === 'completed') { this.failure = error; this.actor.send({ type: 'FAIL' }) }
        }
      }
      this.services = undefined
    })()
    return this.cleanupPromise
  }
  private setStatus(status: TaskStatus) {
    this.inspection.status = status
    this.outputLog(`巡查状态：${status}`)
    this.statusSync = this.statusSync.then(async () => {
      const scope = new TaskScope()
      try {
        const result = await scope.run(signal => this.deps.updateStatus({ taskId: this.inspection._id, status }, signal), this.deps.timing?.status ?? 5000, '同步巡查状态')
        if (result.code !== 0) throw new Error(result.message)
      } catch (error) { this.deps.log.warn('同步巡查状态失败:', error) }
      finally { scope.stop() }
    })
  }
  outputLog(taskLog: string) {
    this.deps.log.info('巡查进度:', {
      taskId: this.inspection._id, taskName: this.inspection.shopName,
      phase: this.getTaskInfo().phase, message: taskLog, progress: { ...this.progress },
    })
    try {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) this.mainWindow.webContents.send('inspection-progress', {
        inspectionTask: this.getTaskInfo(), log: { date: new Date().toISOString(), taskLog },
      })
    } catch (error) { this.deps.log.warn('发送巡查进度失败:', error) }
  }
  private metrics(phase: string) {
    try { this.deps.metrics({ taskId: this.inspection._id, taskName: this.inspection.shopName, phase, ...this.progress }) }
    catch (error) { this.deps.log.warn('记录巡查指标失败:', error) }
  }
}
