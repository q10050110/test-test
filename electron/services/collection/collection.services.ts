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
import { TaskCancelledError, TaskScope, abortableDelay } from '../common/task-scope.services.js'
import { mapPaced } from '../common/concurrent-map.services.js'
import type { VerificationState } from '../ozon/request-window.services.js'

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
  private services?: CollectionServices
  private items?: TaskQueueService
  private writes?: TaskQueueService
  private batches?: TaskQueueService<{ id: string; goods: any[] }>
  private batchIndex = 0
  private detailScope?: TaskScope
  private execution?: Promise<CollectionResult>
  private cleanupPromise?: Promise<void>
  private statusSync = Promise.resolve()
  private disposed = false
  private saved = new Map<string, any>()
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
      this.items = new TaskQueueService(this.taskHandle, 3, {
        label: '商品处理',
        parent: this.scope.signal,
        timeoutMs: this.deps.timing?.item ?? 120_000,
        onError: (error) => this.deps.log.warn('单个商品处理失败:', error),
      })
      this.writes = new TaskQueueService(this.saveGoods, 1, {
        label: '商品保存',
        parent: this.scope.signal,
        timeoutMs: this.deps.timing?.operation ?? 30_000,
        onError: (error) => this.fail(error),
      })
      this.batches = new TaskQueueService(({ goods }, signal) => this.processData(goods, signal), 2, {
        label: '基础数据处理',
        parent: this.scope.signal,
        timeoutMs: this.deps.timing?.operation ?? 30_000,
        onError: (error) => this.fail(error),
      })
      this.deps.metrics({ taskId: this.task._id, taskName: this.task.taskName, phase: 'start' })
      await this.scope.run(() => this.workflow(), this.deps.timing?.run ?? 0, '采集任务')
      this.scope.check()
      this.actor.send({ type: 'FINISH' })
    } catch (error) {
      this.fail(error)
      this.deps.log.error('采集任务结束:', error)
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
    if (this.task.isUseCategorySelect === 0) await this.categoryMode()
    else await this.getHtmlData()
    this.scope.check()
    this.actor.send({ type: 'COLLECTED' })
    await this.waitForAllTasks()
    if (this.task.expendType && !this.targetReached) {
      this.actor.send({ type: 'EXPAND' })
      await this.expendShop()
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
  private pause(kind: 'scroll' | 'detail', signal = this.scope.signal) {
    const ms =
      this.deps.timing?.[kind] ??
      (kind === 'scroll' ? 3000 + Math.random() * 2000 : 1000 + Math.random() * 3000)
    return abortableDelay(ms, signal)
  }
  private async backpressure(signal = this.scope.signal) {
    while (
      !this.targetReached &&
      ((this.items?.getTaskCount() ?? 0) + (this.writes?.getTaskCount() ?? 0) > 20 ||
        (this.batches?.getTaskCount() ?? 0) >= 2)
    ) {
      await abortableDelay(250, signal)
    }
    signal.throwIfAborted()
    this.scope.check()
  }

  private async categoryMode() {
    while (!this.targetReached) {
      await this.backpressure()
      const { data } = await this.step(
        (signal) =>
          this.deps.request({
            url: '/api/goods/hotSales/v2/ozon/getReMaiData',
            method: 'post',
            data: { ...this.query },
            signal,
          }),
        '获取分类商品',
      )
      this.scope.check()
      const list = data?.list || []
      this.query.maxPage = Math.ceil((data?.total || 0) / this.query.pageSize)
      this.query.lastSortValues = data?.lastSortValues || []
      const unique = await this.runtime.parse.ozonDetailListParser(list)
      for (const goods of unique) {
        if (goods.brand === 'без бренда') goods.brand = ''
        goods.nullableCreateDate = dayjs(goods.nullableCreateDate).format('YYYY-MM-DD')
        goods.releaseDate = dayjs().diff(dayjs(goods.nullableCreateDate), 'day')
        goods.clickRate = (((goods.qtyViewPdp || 0) / (goods.views || 1)) * 100).toFixed(2)
      }
      const filtered: any[] = await this.runtime.data.filterData(unique, this.task, 'base')
      // 沿用重构前按间隔启动的节奏，发下一件不等待前一件响应。
      const detailScope = new TaskScope(this.scope.signal)
      this.detailScope = detailScope
      await mapPaced(filtered, async (goods, _index, signal) => {
        await this.backpressure()
        signal.throwIfAborted()
        if (this.targetReached) return
        const response = await this.measure('OZON详情接口', () => this.runtime.main.getDataByApi(goods._id, signal), goods._id)
        signal.throwIfAborted()
        const domain = await this.runtime.main.getDomain()
        signal.throwIfAborted()
        const detail = await this.measure('详情解析及跟卖接口', () => this.runtime.parse.ozonDetailParse(response, domain, goods, signal), goods._id)
        signal.throwIfAborted()
        if (detail?.price && !this.targetReached) {
          const goods = await this.runtime.data.filterData(
            [{ href: `https://www.ozon.ru/product/${detail.id}`, ...detail }], this.task, 'detail',
          )
          signal.throwIfAborted()
          this.enqueue(goods)
        }
      }, signal => this.pause('detail', signal), detailScope.signal).catch(error => {
        this.scope.check()
        if (!this.targetReached || !detailScope.signal.aborted) throw error
      }).finally(() => {
        detailScope.stop()
        this.detailScope = undefined
      })
      if (!list.length || this.query.pageNo >= this.query.maxPage) break
      this.query.pageNo++
    }
  }

  private async getHtmlData() {
    let emptyScrolls = 0
    let bottomCount = 0
    const parsePage = async () => {
      const pageScope = new TaskScope(this.scope.signal)
      this.detailScope = pageScope
      let delivered = 0
      try {
        const { html, domain } = await pageScope.run(
          (signal) => this.runtime.main.getHTML(signal), 0, '读取页面',
        )
        await this.measure('页面解析及跟卖接口', () => pageScope.run(
          (signal) => this.runtime.parse.ozonListParser(html, domain, signal, async (goods, signal) => {
            await this.backpressure(signal)
            if (this.targetReached) return
            signal.throwIfAborted()
            this.batches?.addTask([{ id: String(++this.batchIndex), goods: [goods] }])
            delivered++
          }),
          0, '解析商品列表',
        ))
        this.scope.check()
        this.discovered = this.runtime.parse.getDataCount()
        return delivered
      } catch (error) {
        this.scope.check()
        if (!this.targetReached || !pageScope.signal.aborted) throw error
        return delivered
      } finally {
        pageScope.stop()
        this.detailScope = undefined
      }
    }
    await parsePage()
    while (!this.targetReached && emptyScrolls < 10 && bottomCount < 3) {
      await this.backpressure()
      await this.pause('scroll')
      if (this.targetReached) break
      const moved = await this.step(() => this.runtime.main.scrollPage(), '滚动页面')
      bottomCount = moved ? 0 : bottomCount + 1
      // 触底后也重新解析，避免漏掉延迟加载的最后一批商品。
      const count = await parsePage()
      emptyScrolls = count ? 0 : emptyScrolls + 1
      this.outputLog(`加载商品中，连续无新增 ${emptyScrolls}/10`)
    }
  }

  private async processData(goods: any[], signal: AbortSignal) {
    const base = await this.measure('基础数据接口', () => this.runtime.data.getBaseData(goods, signal))
    signal.throwIfAborted()
    const filtered = !this.task.aiSelectType
      ? await this.runtime.data.aiFilterData(base)
      : await this.runtime.data.filterData(base, this.task)
    signal.throwIfAborted()
    this.enqueue(filtered)
  }
  private enqueue(goods: any[]) {
    this.scope.check()
    if (this.targetReached) return
    this.discovered = this.runtime.parse.getDataCount()
    this.items?.addTask(goods)
    this.outputLog('处理符合条件的商品')
  }

  private taskHandle = async (goods: any, signal: AbortSignal) => {
    signal.throwIfAborted()
    if (this.targetReached) return
    const { link1688, sourcePrice, cover2 } = await this.measure('1688图搜', () => this.runtime.source.createWindow(
      this.task.sourceType,
      goods.cover,
      signal,
    ), goods.id)
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
    if (!this.targetReached) this.writes?.addTask(detail)
  }

  private saveGoods = async (goods: any, signal: AbortSignal) => {
    signal.throwIfAborted()
    if (this.targetReached || this.saved.has(goods.id)) return
    const { code, count, message } = await this.measure('商品保存接口', () => this.deps.save(
      { taskId: this.task._id, datas: [goods] },
      signal,
    ), goods.id)
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
        this.items?.destroy()
        this.batches?.destroy()
        this.detailScope?.stop(new TaskCancelledError('已达到采集目标'))
      }
    }
    this.outputLog('商品已保存')
  }

  private async waitForAllTasks() {
    if (this.targetReached) this.batches?.destroy()
    await this.scope.run(() => this.batches?.whenIdle(), this.deps.timing?.run ?? 0, '等待基础数据处理')
    if (this.targetReached) this.items?.destroy()
    await this.scope.run(() => this.items?.whenIdle(), this.deps.timing?.run ?? 0, '等待商品处理')
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
        await this.step(
          (signal) => this.runtime.main.changeUrl(seller.link, true, signal),
          '进入拓展店铺',
        )
        await this.getHtmlData()
        await this.waitForAllTasks()
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
        () => this.batches?.destroy(),
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
      this.services = undefined
      this.items = undefined
      this.batches = undefined
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
      current:
        (this.items?.getTaskCount() ?? 0) +
        (this.items?.getActiveCount() ?? 0) +
        (this.writes?.getTaskCount() ?? 0) +
        (this.writes?.getActiveCount() ?? 0),
      total: this.discovered,
      totalCount: this.targetData,
    }
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
