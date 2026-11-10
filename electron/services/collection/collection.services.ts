import type { BrowserWindow } from 'electron'
import type { AxiosRequestConfig } from 'axios'
import dayjs from 'dayjs'
import type { MainWindowService } from './main-window.services.js'
import type { WindowService } from './1688-window.services.js'
import type { ExcelService } from './excel.services.js'
import type { DataProcessService } from './data-filter.services.js'
import type { ParseService } from './parse.services.js'
import type { Task, TaskStatus, Query, CollectionResult, CollectionPhase } from './type.js'
import { createCollectionActor } from './collection-machine.services.js'
import { TaskQueueService } from '../common/task-queue.services.js'
import { TaskCancelledError, TaskTimeoutError, TaskScope, abortableDelay } from '../common/task-scope.services.js'
import { VerificationFailedError } from '../common/verification-coordinator.services.js'
import type { VerificationState } from '../ozon/request-window.services.js'

const PROCESSING_HIGH_WATERMARK = 20

interface PageBatch {
  id: string
  candidates: readonly any[]
  ready: any[]
  finished: boolean
  wake?: () => void
}

type ProducerJob =
  | { id: string; kind: 'page'; html: string | undefined; domain: string; announce: (count: number) => void }
  | { id: string; kind: 'detail'; goods: any }
type OtherWork =
  | { id: string; kind: 'filter'; goods: any[] }
  | { id: string; kind: 'detail'; goods: any; source: any }

interface CollectionServices {
  main: Pick<
    MainWindowService,
    | 'createCollectionWindow'
    | 'getHTML'
    | 'getDomain'
    | 'getDataByApi'
    | 'getSellingData'
    | 'scrollPage'
    | 'changeUrl'
    | 'destroy'
  >
  source: Pick<WindowService, 'createWindow' | 'destroy'>
  parse: Pick<
    ParseService,
    | 'ozonListParser'
    | 'ozonDetailListParser'
    | 'ozonDetailParse'
    | 'getDataCount'
    | 'destroy'
    | 'guessLikeList'
  >
  data: Pick<
    DataProcessService,
    'getBaseData' | 'aiFilterData' | 'filterData' | 'getDetailData' | 'destroy'
  >
  excel: Pick<ExcelService, 'DeleteFilled' | 'getFilePath' | 'destroy'>
}

export interface CollectionDependencies {
  createServices(onClosed: () => void, tableName: string, onVerification?: (state: VerificationState) => void): CollectionServices
  request(config: AxiosRequestConfig): Promise<any>
  save(
    data: { taskId: string; datas: any[] },
    signal?: AbortSignal,
  ): Promise<{ code: number; count: number; message?: unknown }>
  upload(task: Task, goods: Map<string, any>, signal?: AbortSignal): Promise<string>
  log: { info(...args: any[]): void; warn(...args: any[]): void; error(...args: any[]): void }
  metrics(data: any): void
  timing?: {
    operation?: number
    item?: number
    run?: number
    scroll?: number
    detail?: number
    status?: number
  }
}

export class CollectionRunError extends Error {
  constructor(
    message: string,
    readonly result: CollectionResult,
  ) {
    super(message)
    this.name = 'CollectionRunError'
  }
}

/** 一个实例只拥有一次运行；run() 在所有清理完成后才 resolve/reject。 */
export class Collection {
  private readonly actor = createCollectionActor()
  private readonly scope = new TaskScope()
  private readonly productionScope = new TaskScope(this.scope.signal)
  private services?: CollectionServices
  private items?: TaskQueueService
  private writes?: TaskQueueService
  private batches?: TaskQueueService<PageBatch>
  private producers?: TaskQueueService<ProducerJob>
  private otherWork?: TaskQueueService<OtherWork>
  private batchIndex = 0
  private workIndex = 0
  private readonly saveReservations = new Set<symbol>()
  private readonly saveWaiters = new Set<() => void>()
  private readonly capacityWaiters = new Set<() => void>()
  private execution?: Promise<CollectionResult>
  private cleanupPromise?: Promise<void>
  private statusSync = Promise.resolve()
  private disposed = false
  private saved = new Map<string, any>()
  // 显示计数独立于执行队列：整批登记，跨阶段不重复计数，结束后逐件移除。
  private processing = new Map<string, 'pending' | 'downstream' | 'saving'>()
  private targetData = 0
  private expendShopCount = 0
  private hasUpLimit = false
  private discovered = 0
  private failure?: unknown
  private query: Query

  constructor(
    private task: Task,
    private mainWindow: BrowserWindow | null,
    private readonly deps: CollectionDependencies,
  ) {
    this.query = {
      pageNo: 1,
      pageSize: 30,
      total: 0,
      maxPage: 99,
      categories: [...new Set(task.categoryIds?.flat(2) || [])],
      isAutoBang: true,
      lastSortValues: [],
    }
    this.initQueryParams(task)
  }

  getPhase(): CollectionPhase {
    const snapshot = this.actor.getSnapshot()
    if (typeof snapshot.value === 'object') return snapshot.value.running
    if (snapshot.value === 'cleaning' && snapshot.context.outcome === 'cancelled') return 'stopping'
    return snapshot.value
  }
  getTaskInfo() {
    return { ...this.task, phase: this.getPhase() }
  }
  async getTableFilePath() {
    return this.task.tableFilePath || ''
  }
  private get targetReached() {
    return this.targetData >= (this.task.targetCount || Infinity)
  }
  private get runtime() {
    if (!this.services) throw new Error('采集服务尚未初始化')
    return this.services
  }

  run(): Promise<CollectionResult> {
    if (this.execution) return this.execution
    if (this.disposed) return Promise.reject(new Error('任务已释放，请创建新的采集任务'))
    this.actor.send({ type: 'START' })
    this.setStatus('running')
    this.execution = this.execute()
    return this.execution
  }

  private async execute(): Promise<CollectionResult> {
    let result: CollectionResult
    try {
      this.services = this.deps.createServices(
        this.closeHandle,
        `${this.task.taskName}_${this.task._id}`,
        state => {
          if (this.scope.signal.aborted) return
          this.task.verification = state
          const labels = { waiting: '等待验证', verifying: '滑块验证中', retrying: '恢复请求中', ready: '接口请求已恢复', failed: '接口验证或请求失败' }
          this.outputLog(`${labels[state.phase]}${state.attempt ? `（${state.attempt}/3）` : ''}`)
        },
      )
      this.items = new TaskQueueService(this.sourceHandle, 3, {
        label: '1688图搜',
        parent: this.productionScope.signal,
        timeoutMs: this.deps.timing?.item ?? 120_000,
        onError: (error, goods) => this.deps.log.warn('单个商品1688图搜失败:', {
          taskId: this.task._id, goodsId: goods.id, error,
        }),
        onSettled: goods => {
          if (this.processing.get(String(goods.id)) === 'pending') this.finishProcessing(goods.id)
        },
      })
      this.writes = new TaskQueueService(this.saveGoods, Infinity, {
        label: '商品保存',
        parent: this.scope.signal,
        // 目标数边界的预留等待不计入网络超时；保存请求自身单独计时。
        timeoutMs: 0,
        onError: (error) => this.fail(error),
        onSettled: goods => this.finishProcessing(goods.id),
      })
      this.batches = new TaskQueueService((batch, signal) => this.processPageBatch(batch, signal), Infinity, {
        label: '基础数据处理',
        parent: this.productionScope.signal,
        // 一批可以等页面流式产出；基础数据网络请求在处理函数内独立限时。
        timeoutMs: 0,
        onError: (error) => this.fail(error),
      })
      this.producers = new TaskQueueService<ProducerJob>((job, signal) => job.kind === 'page'
        ? this.producePage(job, signal) : this.produceDetail(job.goods, signal), Infinity, {
        label: '采集生产', parent: this.productionScope.signal, timeoutMs: 0,
        onError: (error, job) => {
          // 商品网络异常只结束这一件；验证失败、窗口关闭和程序错误仍明确失败。
          if (job.kind === 'detail' && this.isProductNetworkError(error)) {
            this.deps.log.warn('分类商品请求失败，跳过该商品:', {
              taskId: this.task._id, goodsId: job.goods._id, error,
            })
            this.outputLog(`商品 ${job.goods._id}：详情请求失败，继续处理其他商品`)
          } else this.fail(error)
        },
      })
      this.otherWork = new TaskQueueService<OtherWork>((job, signal) => this.processOtherWork(job, signal), Infinity, {
        label: '商品后续处理', parent: this.productionScope.signal, timeoutMs: 0,
        onError: (error, job) => {
          if (job.kind === 'filter') this.fail(error)
          else this.deps.log.warn('单个商品处理失败:', error)
        },
        onSettled: job => {
          if (job.kind === 'detail' && this.processing.get(String(job.goods.id)) !== 'saving')
            this.finishProcessing(job.goods.id)
        },
      })
      this.deps.log.info('采集调度配置:', {
        taskId: this.task._id, sourceConcurrency: 3, categoryIntervalMs: this.deps.timing?.detail ?? 1000,
        pendingThreshold: PROCESSING_HIGH_WATERMARK, pageRequestsWaitForResponses: false,
      })
      this.deps.metrics({ taskId: this.task._id, taskName: this.task.taskName, phase: 'start' })
      await this.scope.run(() => this.workflow(), this.deps.timing?.run ?? 0, '采集任务')
      this.scope.check()
      this.actor.send({ type: 'FINISH' })
    } catch (error) {
      this.fail(error)
      this.deps.log.error('采集任务结束:', { taskId: this.task._id, taskName: this.task.taskName, error })
    } finally {
      result = this.buildResult()
      await this.cleanup()
      this.actor.send({ type: 'CLEANED' })
      const status = this.actor.getSnapshot().context.outcome
      this.setStatus(status)
      result.status = status
      if (this.failure) result.error = this.errorMessage(this.failure)
      await this.statusSync
      this.actor.stop()
      this.deps.metrics({ taskId: this.task._id, phase: 'cleanup', goodsDataSize: this.saved.size })
    }
    if (result.status !== 'completed')
      throw new CollectionRunError(result.error || '任务已取消', result)
    return result
  }

  private async workflow() {
    await this.step(() => this.runtime.excel.DeleteFilled(), '初始化表格')
    this.task.tableFilePath = undefined
    this.task.autoResult = undefined
    await this.scope.run(
      (signal) =>
        this.runtime.main.createCollectionWindow(
          this.task.targetUrl || 'https://www.ozon.ru',
          signal,
        ),
      100_000,
      '创建采集窗口',
    )
    this.scope.check()
    this.actor.send({ type: 'READY' })
    this.outputLog('采集窗口已就绪')
    await this.produceUntilTarget(() => this.task.isUseCategorySelect === 0 ? this.categoryMode() : this.getHtmlData())
    this.scope.check()
    this.actor.send({ type: 'COLLECTED' })
    await this.waitForAllTasks()
    if (this.task.expendType && !this.targetReached) {
      this.actor.send({ type: 'EXPAND' })
      await this.produceUntilTarget(() => this.expendShop())
      this.scope.check()
      this.actor.send({ type: 'EXPANDED' })
      await this.waitForAllTasks()
    }
    this.scope.check()
    this.deps.metrics({ taskId: this.task._id, phase: 'collected', goodsDataSize: this.saved.size })
    if (this.task.isUseAutoUpGoods && this.saved.size) {
      this.actor.send({ type: 'UPLOAD' })
      this.task.autoResult = await this.scope.run(
        (signal) => this.deps.upload(this.task, this.saved, signal),
        600_000,
        '自动上架',
      )
      this.scope.check()
      if (this.task.autoResult !== 'success') throw new Error(this.task.autoResult)
    }
  }

  private step<T>(operation: (signal: AbortSignal) => PromiseLike<T> | T, label: string) {
    return this.scope.run(operation, this.deps.timing?.operation ?? 30_000, label)
  }
  /** 页面接口由请求窗口独立限制网络/验证时长；外层只负责整项任务取消。 */
  private pageStep<T>(operation: (signal: AbortSignal) => PromiseLike<T> | T, label: string) {
    return this.scope.run(operation, 0, label)
  }
  private async measure<T>(stage: string, operation: () => PromiseLike<T> | T, goodsId?: string): Promise<T> {
    const started = performance.now()
    try { return await operation() }
    finally {
      this.deps.log.info('采集阶段耗时:', {
        taskId: this.task._id, stage, goodsId, elapsedMs: Math.round(performance.now() - started),
        activeItems: this.items?.getActiveCount() ?? 0, pendingItems: this.items?.getTaskCount() ?? 0,
      })
    }
  }
  private pause(_kind: 'scroll', signal = this.productionScope.signal) {
    return abortableDelay(this.deps.timing?.scroll ?? 3000 + Math.random() * 2000, signal)
  }
  private async produceUntilTarget(operation: () => Promise<void>) {
    try { await operation() }
    catch (error) {
      this.scope.check()
      if (!this.targetReached || !this.productionScope.signal.aborted) throw error
    }
  }

  private trackProcessing(goods: readonly any[]) {
    this.scope.check()
    if (this.targetReached) return
    let added = 0
    for (const item of goods) {
      const id = String(item.id ?? item._id ?? '')
      if (!id || this.processing.has(id)) continue
      this.processing.set(id, 'pending')
      added++
    }
    if (added) this.outputLog(`本批新增 ${added} 个待处理商品`)
  }

  private finishProcessing(id: unknown, notify = true) {
    if (!this.processing.delete(String(id))) return
    if (this.processing.size <= PROCESSING_HIGH_WATERMARK) {
      for (const wake of this.capacityWaiters) wake()
      this.capacityWaiters.clear()
    }
    if (notify) this.outputLog('商品处理结束')
  }

  /** 只暂停本任务的新分页/滚动；已登记批次及下游必须继续消费，才能降到阈值。 */
  private async waitForProducerCapacity() {
    this.productionScope.check()
    if (this.targetReached || this.processing.size <= PROCESSING_HIGH_WATERMARK) return
    const started = performance.now()
    const scope = new TaskScope(this.productionScope.signal)
    let wake: (() => void) | undefined
    this.deps.log.info('采集背压等待:', {
      taskId: this.task._id, current: this.processing.size, limit: PROCESSING_HIGH_WATERMARK,
    })
    this.outputLog(`正在处理 ${this.processing.size} 个商品，暂停加载新商品，降至20个后恢复`)
    try {
      while (!this.targetReached && this.processing.size > PROCESSING_HIGH_WATERMARK) {
        try {
          await scope.run(() => new Promise<void>(resolve => {
            if (this.targetReached || this.processing.size <= PROCESSING_HIGH_WATERMARK) resolve()
            else { wake = resolve; this.capacityWaiters.add(resolve) }
          }), 0)
        } finally {
          if (wake) this.capacityWaiters.delete(wake)
          wake = undefined
        }
      }
      scope.check()
      this.deps.log.info('采集背压恢复:', {
        taskId: this.task._id, current: this.processing.size, limit: PROCESSING_HIGH_WATERMARK,
        waitMs: Math.round(performance.now() - started),
      })
      this.outputLog(`待处理商品降至 ${this.processing.size} 个，恢复加载新商品`)
    } finally { scope.stop() }
  }

  private async categoryMode() {
    let lastRequestStarted: number | undefined
    const pace = async () => {
      if (lastRequestStarted !== undefined) {
        const interval = this.deps.timing?.detail ?? 1000
        await abortableDelay(Math.max(0, interval - (performance.now() - lastRequestStarted)), this.productionScope.signal)
      }
      this.productionScope.check()
      lastRequestStarted = performance.now()
    }
    while (!this.targetReached) {
      await this.waitForProducerCapacity()
      await pace()
      const { data } = await this.productionScope.run(
        (signal) =>
          this.deps.request({
            url: '/api/goods/hotSales/v2/ozon/getReMaiData',
            method: 'post',
            data: { ...this.query },
            signal,
          }),
        this.deps.timing?.operation ?? 30_000, '获取分类商品',
      )
      this.scope.check()
      const list = data?.list || []
      this.query.maxPage = Math.ceil((data?.total || 0) / this.query.pageSize)
      this.query.lastSortValues = data?.lastSortValues || []
      const unique = await this.runtime.parse.ozonDetailListParser(list)
      this.discovered = this.runtime.parse.getDataCount()
      if (unique.length) this.outputLog(`本批爬取 ${unique.length} 个新商品`)
      for (const goods of unique) {
        if (goods.brand === 'без бренда') goods.brand = ''
        goods.nullableCreateDate = dayjs(goods.nullableCreateDate).format('YYYY-MM-DD')
        goods.releaseDate = dayjs().diff(dayjs(goods.nullableCreateDate), 'day')
        goods.clickRate = (((goods.qtyViewPdp || 0) / (goods.views || 1)) * 100).toFixed(2)
      }
      const filtered: any[] = await this.runtime.data.filterData(unique, this.task, 'base')
      this.deps.log.info('分类基础筛选结果:', {
        taskId: this.task._id, pageNo: this.query.pageNo, discovered: unique.length, accepted: filtered.length,
      })
      this.trackProcessing(filtered.map(goods => ({ id: goods._id })))
      // 当前批次已经整批计入 processing，必须继续派发，不能在这里按同一计数等待。
      for (const goods of filtered) {
        await pace()
        if (this.targetReached) return
        this.producers?.addTask([{ id: `detail:${goods._id}`, kind: 'detail', goods }])
      }
      if (!list.length || this.query.pageNo >= this.query.maxPage) break
      this.query.pageNo++
    }
  }

  private isProductNetworkError(error: unknown) {
    if (error instanceof VerificationFailedError) return false
    return error instanceof TaskTimeoutError || /^(?:Failed to fetch|fetch failed|NetworkError\b)/i.test(this.errorMessage(error))
  }

  private async produceDetail(goods: any, signal: AbortSignal) {
    let handedOff = false
    try {
      signal.throwIfAborted()
      if (this.targetReached) return
      const response = await this.measure('OZON详情接口', () => this.runtime.main.getDataByApi(goods._id, signal), goods._id)
      signal.throwIfAborted()
      const domain = await this.runtime.main.getDomain()
      signal.throwIfAborted()
      const detail = await this.measure('详情解析及跟卖接口', () => this.runtime.parse.ozonDetailParse(response, domain, goods, signal), goods._id)
      signal.throwIfAborted()
      if (detail?.price && !this.targetReached) {
        const filtered = await this.runtime.data.filterData(
          [{ href: `https://www.ozon.ru/product/${detail.id}`, ...detail }], this.task, 'detail',
        )
        signal.throwIfAborted()
        this.enqueue(filtered)
        handedOff = filtered.length > 0
      } else if (!this.targetReached) {
        this.deps.log.info('分类商品无有效价格:', { taskId: this.task._id, goodsId: goods._id })
      }
    } finally { if (!handedOff) this.finishProcessing(goods._id) }
  }

  private async producePage(job: Extract<ProducerJob, { kind: 'page' }>, signal: AbortSignal) {
    let batch: PageBatch | undefined
    try {
      await this.measure('页面解析及跟卖接口', () => this.runtime.parse.ozonListParser(job.html, job.domain, signal,
        async (goods, inner) => {
          inner.throwIfAborted()
          if (this.targetReached) return
          if (!batch) throw new Error('页面批次尚未初始化')
          batch.ready.push(goods)
          batch.wake?.()
        }, goods => {
          this.discovered = this.runtime.parse.getDataCount()
          this.trackProcessing(goods)
          batch = { id: job.id, candidates: goods, ready: [], finished: false }
          this.batches?.addTask([batch])
          // 已取得页面快照中的新 SKU，滚动无需等待本页接口全部返回。
          job.announce(goods.length)
        }))
    } finally {
      if (batch) { batch.finished = true; batch.wake?.() }
      job.announce(0)
    }
  }

  private async getHtmlData() {
    let emptyScrolls = 0
    let bottomCount = 0
    const parsePage = async () => {
      const { html, domain } = await this.productionScope.run(
        (signal) => this.runtime.main.getHTML(signal), 0, '读取页面',
      )
      let announce!: (count: number) => void
      const discovered = new Promise<number>(resolve => { announce = resolve })
      this.producers?.addTask([{ id: `page:${++this.batchIndex}`, kind: 'page', html, domain, announce }])
      return this.productionScope.run(() => discovered, 0)
    }
    await parsePage()
    while (!this.targetReached && emptyScrolls < 10 && bottomCount < 3) {
      await this.waitForProducerCapacity()
      await this.pause('scroll')
      await this.waitForProducerCapacity()
      if (this.targetReached) break
      const moved = await this.productionScope.run(() => this.runtime.main.scrollPage(), this.deps.timing?.operation ?? 30_000, '滚动页面')
      bottomCount = moved ? 0 : bottomCount + 1
      // 触底后也重新解析，避免漏掉延迟加载的最后一批商品。
      const count = await parsePage()
      emptyScrolls = count ? 0 : emptyScrolls + 1
      this.outputLog(`加载商品中，连续无新增 ${emptyScrolls}/10`)
    }
    const reason = this.targetReached ? '已达到目标' : bottomCount >= 3 ? '连续3次触底' : '连续10次没有新商品'
    this.deps.log.info('页面采集停止:', {
      taskId: this.task._id, reason, emptyScrolls, bottomCount,
      processing: this.processing.size, sourcePending: this.items?.getTaskCount() ?? 0,
    })
    if (!this.targetReached) this.outputLog(`页面加载结束：${reason}，继续处理剩余商品`)
  }

  private async processPageBatch(batch: PageBatch, signal: AbortSignal) {
    const scope = new TaskScope(signal)
    try {
      // 一页只请求一次基础数据，与本页跟卖请求、后续滚动同时推进。
      this.deps.log.info('页面基础数据整批获取:', {
        taskId: this.task._id, batchId: batch.id, count: batch.candidates.length,
      })
      const base = await this.measure('基础数据接口', () => scope.run(
        inner => this.runtime.data.getBaseData([...batch.candidates], inner),
        this.deps.timing?.operation ?? 30_000, '获取基础数据',
      ))
      scope.check()
      const lookup = new Map(base.map(item => [String(item.productId ?? item.id), item]))
      while (batch.ready.length || !batch.finished) {
        scope.check()
        if (!batch.ready.length) {
          try { await scope.run(() => new Promise<void>(resolve => {
            if (batch.ready.length || batch.finished) resolve()
            else batch.wake = resolve
          }), 0) }
          finally { batch.wake = undefined }
          continue
        }
        const ready = batch.ready.splice(0).map(goods => ({ ...goods, ...lookup.get(String(goods.id)) }))
        this.otherWork?.addTask([{ id: `filter:${++this.workIndex}`, kind: 'filter', goods: ready }])
      }
    } finally { batch.wake = undefined; scope.stop() }
  }

  private async processData(base: any[], signal: AbortSignal) {
    signal.throwIfAborted()
    const filtered = !this.task.aiSelectType
      ? await this.runtime.data.aiFilterData(base)
      : await this.runtime.data.filterData(base, this.task)
    signal.throwIfAborted()
    const accepted = new Set(filtered.map(item => String(item.id)))
    for (const item of base) {
      if (!accepted.has(String(item.id))) this.finishProcessing(item.id)
    }
    this.enqueue(filtered)
  }
  private enqueue(goods: any[]) {
    this.scope.check()
    if (this.targetReached) return
    this.discovered = this.runtime.parse.getDataCount()
    this.items?.addTask(goods)
    this.outputLog('处理符合条件的商品')
  }

  private async processOtherWork(job: OtherWork, signal: AbortSignal) {
    const scope = new TaskScope(signal)
    try {
      await scope.run(inner => job.kind === 'filter' ? this.processData(job.goods, inner)
        : this.processGoods(job.goods, job.source, inner), this.deps.timing?.operation ?? 30_000,
      job.kind === 'filter' ? '筛选基础数据' : '商品筛选及翻译')
    } finally { scope.stop() }
  }

  private sourceHandle = async (goods: any, signal: AbortSignal) => {
    signal.throwIfAborted()
    if (this.targetReached) return
    const source = await this.measure('1688图搜', () => this.runtime.source.createWindow(
      this.task.sourceType,
      goods.cover,
      signal,
      { taskId: this.task._id, goodsId: goods.id, onStage: stage => {
        if (!signal.aborted) this.outputLog(`商品 ${goods.id}：1688${stage}`)
      } },
    ), goods.id)
    signal.throwIfAborted()
    if (this.targetReached) return
    if (this.processing.has(String(goods.id))) this.processing.set(String(goods.id), 'downstream')
    // 图搜结束就释放 1688 名额；筛选、翻译、保存使用独立的直接并发工作。
    this.otherWork?.addTask([{ id: `detail:${goods.id}`, kind: 'detail', goods, source }])
  }

  private async processGoods(goods: any, { link1688, sourcePrice, cover2 }: any, signal: AbortSignal) {
    signal.throwIfAborted()
    if (this.targetReached) return
    const detail = await this.measure('商品筛选及翻译接口', () => this.runtime.data.getDetailData(
      {
        taskId: this.task._id,
        upMode: this.task.upMode,
        reqDatas: [
          {
            ...goods,
            '1688link': link1688,
            sourcePrice,
            cover2,
            myProfitPercent: this.task.myProfitPercent,
            rubExpressPrice: this.task.rubExpressPrice,
            internalExpress: this.task.internalExpress,
          },
        ],
      },
      signal,
    ), goods.id)
    signal.throwIfAborted()
    if (!detail.length) this.deps.log.info('商品服务端筛选无结果:', { taskId: this.task._id, goodsId: goods.id })
    if (!this.targetReached) {
      for (const item of detail) {
        const id = String(item.id)
        if (this.processing.has(id)) this.processing.set(id, 'saving')
      }
      this.writes?.addTask(detail)
    }
  }

  private async reserveSave(scope: TaskScope): Promise<symbol | undefined> {
    const target = this.task.targetCount || Infinity
    while (!this.targetReached && this.targetData + this.saveReservations.size >= target) {
      let wake: (() => void) | undefined
      try {
        await scope.run(() => new Promise<void>(resolve => {
          if (this.targetReached || this.targetData + this.saveReservations.size < target) resolve()
          else { wake = resolve; this.saveWaiters.add(resolve) }
        }), 0)
      } finally { if (wake) this.saveWaiters.delete(wake) }
    }
    scope.check()
    if (this.targetReached) return
    const token = Symbol()
    this.saveReservations.add(token)
    return token
  }

  private saveGoods = async (goods: any, signal: AbortSignal) => {
    signal.throwIfAborted()
    if (this.targetReached || this.saved.has(goods.id)) return
    const scope = new TaskScope(signal)
    let reservation: symbol | undefined
    try {
      // 仅预留剩余目标数量，防止并发请求超采；这不是固定并发或串行保存限制。
      reservation = await this.reserveSave(scope)
      if (!reservation) return
      const { code, count, message } = await this.measure('商品保存接口', () => scope.run(inner => this.deps.save(
        { taskId: this.task._id, datas: [goods] }, inner,
      ), this.deps.timing?.operation ?? 30_000, '商品保存'), goods.id)
      signal.throwIfAborted()
      if (code) {
        this.hasUpLimit = code === 402 || code === 403
        throw new Error(
          this.hasUpLimit ? '当日选品额度不足' : `保存商品失败：${String(message ?? code)}`,
        )
      }
      if (count > 0) {
        this.saved.set(goods.id, goods)
        this.targetData += count
        if (this.targetReached) {
          this.productionScope.stop(new TaskCancelledError('已达到采集目标'))
          this.processing.clear()
        }
      }
      this.finishProcessing(goods.id, false)
      this.deps.log.info('商品保存结果:', { taskId: this.task._id, goodsId: goods.id, count })
      this.outputLog(count > 0 ? '商品已保存' : '商品处理完成：服务端返回新增数量为0')
    } finally {
      scope.stop()
      if (reservation && this.saveReservations.delete(reservation)) {
        for (const wake of this.saveWaiters) wake()
        this.saveWaiters.clear()
      }
    }
  }

  private async waitForAllTasks() {
    await this.scope.run(() => this.producers?.whenIdle(), this.deps.timing?.run ?? 0, '等待采集请求')
    await this.scope.run(() => this.batches?.whenIdle(), this.deps.timing?.run ?? 0, '等待基础数据处理')
    await this.scope.run(() => this.otherWork?.whenIdle(), this.deps.timing?.run ?? 0, '等待商品筛选')
    await this.scope.run(() => this.items?.whenIdle(), this.deps.timing?.run ?? 0, '等待商品处理')
    await this.scope.run(() => this.otherWork?.whenIdle(), this.deps.timing?.run ?? 0, '等待筛选及翻译')
    await this.scope.run(() => this.writes?.whenIdle(), this.deps.timing?.run ?? 0, '等待商品保存')
    this.scope.check()
  }

  private async expendShop() {
    const visited = new Set<string>()
    const visit = async (sellers: any[]) => {
      const candidates = sellers
        .filter((s) => Number(s?.rating?.totalScore) > 4)
        .sort(
          (a, b) =>
            Number(b?.price?.cardPrice?.price?.replace(/[^\d.]/g, '')) -
            Number(a?.price?.cardPrice?.price?.replace(/[^\d.]/g, '')),
        )
        .slice(0, Math.ceil(this.task.expendShopCount / 20))
      for (const seller of candidates) {
        this.scope.check()
        if (this.targetReached || this.expendShopCount >= this.task.expendShopCount) return
        if (!seller.link || visited.has(seller.link)) continue
        visited.add(seller.link)
        this.expendShopCount++
        await this.productionScope.run(
          (signal) => this.runtime.main.changeUrl(seller.link, true, signal),
          this.deps.timing?.operation ?? 30_000, '进入拓展店铺',
        )
        await this.getHtmlData()
      }
    }
    for (const goods of Array.from(this.saved.values())) await visit(goods?.sellers?.sellers || [])
    for (const url of this.runtime.parse.guessLikeList) {
      if (this.targetReached || this.expendShopCount >= this.task.expendShopCount) break
      const response = await this.pageStep(
        (signal) => this.runtime.main.getSellingData(url, signal),
        '获取拓店卖家',
      )
      if (response?.success) {
        const sellers = JSON.parse(
          response.data.widgetStates?.['webSellerList-4723017-default-1'] || '{}',
        )
        await visit(sellers.sellers || [])
      }
    }
  }

  private fail(error: unknown) {
    if (!this.actor.getSnapshot().matches('running')) return
    this.failure = error
    this.actor.send({ type: 'FAIL' })
    this.outputLog(`采集失败：${this.errorMessage(error)}`)
    this.scope.stop(error)
  }
  closeHandle = () => this.fail(new Error('采集窗口异常关闭'))

  async cancel() {
    if (this.actor.getSnapshot().status === 'done') return
    if (this.actor.getSnapshot().matches('cleaning')) {
      await this.execution?.catch(() => undefined)
      return
    }
    this.failure = new TaskCancelledError()
    this.actor.send({ type: 'CANCEL' })
    this.outputLog('正在终止任务，请稍候')
    this.emitLifecycleState()
    this.scope.stop(this.failure)
    if (this.execution) await this.execution.catch(() => undefined)
    else {
      await this.cleanup()
      this.actor.send({ type: 'CLEANED' })
      this.setStatus('cancelled')
      await this.statusSync
      this.actor.stop()
    }
  }

  private buildResult(): CollectionResult {
    return {
      filePath: this.task.tableFilePath || '',
      progress: { current: 0, total: this.discovered, totalCount: this.targetData },
      autoResult: this.task.autoResult,
      upGoodsList: [...this.saved.values()],
      hasUpLimit: this.hasUpLimit,
      status: this.actor.getSnapshot().context.outcome,
    }
  }

  /** 所有出口共用的幂等清理。一个资源失败不影响其他资源释放。 */
  private cleanup(): Promise<void> {
    if (this.cleanupPromise) return this.cleanupPromise
    this.disposed = true
    this.task.verification = undefined
    this.outputLog(this.getPhase() === 'stopping' ? '正在终止任务，请稍候' : '正在结束任务，请稍候')
    this.emitLifecycleState()
    this.scope.stop(new TaskCancelledError('任务正在清理'))
    this.cleanupPromise = (async () => {
      const cleanups = [
        () => this.producers?.destroy(),
        () => this.batches?.destroy(),
        () => this.otherWork?.destroy(),
        () => this.items?.destroy(),
        () => this.writes?.destroy(),
        () => this.services?.source.destroy(),
        () => this.services?.main.destroy(),
        () => this.services?.excel.destroy(),
        () => this.services?.data.destroy(),
        () => this.services?.parse.destroy(),
      ]
      for (const release of cleanups) {
        try {
          await release()
        } catch (error) {
          this.deps.log.error('释放采集资源失败:', error)
          if (this.actor.getSnapshot().context.outcome === 'completed') {
            this.failure = error
            this.actor.send({ type: 'FAIL' })
          }
        }
      }
      this.saved.clear()
      this.processing.clear()
      this.saveReservations.clear()
      this.saveWaiters.clear()
      this.capacityWaiters.clear()
      this.productionScope.stop()
      this.services = undefined
      this.items = undefined
      this.batches = undefined
      this.producers = undefined
      this.otherWork = undefined
      this.writes = undefined
      this.mainWindow = null
    })()
    return this.cleanupPromise
  }

  async clearStatus(_retainCompleted = false, _destroy = true) {
    if (this.execution) {
      await this.cancel()
      return
    }
    await this.cleanup()
    this.actor.stop()
  }
  updateTaskData(task: Partial<Task>) {
    const { _id, taskStatus, progress, phase, ...changes } = task
    Object.assign(this.task, changes)
  }
  async updateStatus(status: TaskStatus) {
    if (status === 'cancelled') return this.cancel()
    if (status === 'pending' && this.actor.getSnapshot().matches('idle')) this.setStatus(status)
    await this.statusSync
  }
  private setStatus(status: TaskStatus) {
    this.task.taskStatus = status
    this.outputLog(`任务状态：${status}`)
    this.statusSync = this.statusSync.then(async () => {
      const scope = new TaskScope()
      try {
        await scope.run(
          (signal) =>
            this.deps.request({
              url: '/api/auto/autoTask/updateStatus',
              method: 'post',
              data: { taskId: this.task._id, taskStatus: status },
              signal,
            }),
          this.deps.timing?.status ?? 5000,
          '同步任务状态',
        )
      } catch (error) {
        this.deps.log.warn('任务状态同步失败:', error)
      } finally {
        scope.stop()
      }
    })
  }
  outputLog(message: string) {
    this.task.progress = {
      current: this.processing.size,
      total: this.discovered,
      totalCount: this.targetData,
    }
    this.deps.log.info('采集进度:', {
      taskId: this.task._id, taskName: this.task.taskName, phase: this.getPhase(),
      message, progress: { ...this.task.progress },
      work: {
        sourceActive: this.items?.getActiveCount() ?? 0,
        sourcePending: this.items?.getTaskCount() ?? 0,
        producerActive: this.producers?.getActiveCount() ?? 0,
        otherActive: this.otherWork?.getActiveCount() ?? 0,
        saveActive: this.saveReservations.size,
      },
    })
    try {
      if (this.mainWindow && !this.mainWindow.isDestroyed())
        this.mainWindow.webContents.send('task-progress', {
          collectionTask: { ...this.task, hasUpLimit: this.hasUpLimit, phase: this.getPhase() },
          log: { date: `[${dayjs().format('YYYY/MM/DD HH:mm:ss')}]`, taskLog: message },
        })
    } catch (error) {
      this.deps.log.warn('发送采集进度失败:', error)
    }
  }
  private errorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error)
  }

  private emitLifecycleState() {
    try {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('task-status-update', {
          task: this.getTaskInfo(),
          status: this.task.taskStatus,
        })
      }
    } catch (error) {
      this.deps.log.warn('发送任务阶段失败:', error)
    }
  }

  private initQueryParams(task: Task) {
    this.query.weightRangeMin = task.weightRangeMin
    this.query.weightRangeMax = task.weightRangeMax
    this.query.packageLengthMin = task.packageLengthMin
    this.query.packageLengthMax = task.packageLengthMax
    this.query.packageWidthMin = task.packageWidthMin
    this.query.packageWidthMax = task.packageWidthMax
    this.query.packageHeightMin = task.packageHeightMin
    this.query.packageHeightMax = task.packageHeightMax
    this.query.nullableRedemptionRateMin = task.nullableRedemptionRateMin
    this.query.nullableRedemptionRateMax = task.nullableRedemptionRateMax
    this.query.returnCancelRateMin = task.returnCancelRateMin
    this.query.returnCancelRateMax = task.returnCancelRateMax
    this.query.brandType = task.brandType
    this.query.gmvSumMin = task.gmvSumMin
    this.query.gmvSumMax = task.gmvSumMax
    this.query.searchAndCartConversionMin = task.showRateMin
    this.query.searchAndCartConversionMax = task.showRateMax
    this.query.soldCountMin = task.soldCountMin
    this.query.soldCountMax = task.soldCountMax
    this.query.shelfDateMin = task.upGoodsTimeMin
    this.query.shelfDateMax = task.upGoodsTimeMax
    if (task.upGoodsTimeMin || task.upGoodsTimeMax) {
      this.query.upGoodsTime = this.getUpDate(task.upGoodsTimeMax, task.upGoodsTimeMin)
    }
    this.query.salesDynamicsMin = task.monthDynamicsMin
    this.query.salesDynamicsMax = task.monthDynamicsMax
    this.query.drrMin = task.adFeeMin
    this.query.drrMax = task.adFeeMax
    this.query.daysInPromoMin = task.promotionDayMin
    this.query.daysInPromoMax = task.promotionDayMax
    this.query.discountMin = task.promotionDiscountMin
    this.query.discountMax = task.promotionDiscountMax
    this.query.promoRevenueShareMin = task.promotionDynamicsMin
    this.query.promoRevenueShareMax = task.promotionDynamicsMax
    this.query.daysWithTrafaretsMin = task.promoteDayMin
    this.query.daysWithTrafaretsMax = task.promoteDayMax
    this.query.qtyViewPdpMin = task.viewsMin
    this.query.qtyViewPdpMax = task.viewsMax
    this.query.pdpToCartConversionMin = task.cardRateMin
    this.query.pdpToCartConversionMax = task.cardRateMax
    this.query.salesSchema = task.salesSchema
  }

  /**
   * 获取上架时间
   */
  getUpDate(startNum: number = 0, endNum: number = 0) {
    const startOfDay = dayjs().startOf('day')
    const endOfDay = dayjs().endOf('day')
    const startTargetDate = startOfDay.subtract(startNum, 'day')
    const endTargetDate = endOfDay.subtract(endNum, 'day')
    const startTimestamp = startTargetDate.valueOf()
    const endTimestamp = endTargetDate.valueOf()
    return [startTimestamp, endTimestamp]
  }
}
