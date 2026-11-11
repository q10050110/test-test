import { test } from 'node:test'
import assert from 'node:assert/strict'
import { setTimeout as delay } from 'node:timers/promises'
import {
  Collection,
  CollectionRunError,
  type CollectionDependencies,
} from '../../electron/services/collection/collection.services.js'
import { createCollectionActor } from '../../electron/services/collection/collection-machine.services.js'
import {
  TaskScope,
  TaskCancelledError,
  TaskTimeoutError,
} from '../../electron/services/common/task-scope.services.js'
import { TaskQueueService } from '../../electron/services/common/task-queue.services.js'
import { mapConcurrent, mapPaced } from '../../electron/services/common/concurrent-map.services.js'
import type { Task } from '../../electron/services/collection/type.js'
import { ParseService } from '../../electron/services/collection/parse.services.js'
import type { GoodsConsumer, GoodsBatchObserver } from '../../electron/services/common/ozon-parse.services.js'
import { VerificationFailedError } from '../../electron/services/common/verification-coordinator.services.js'

async function parsedGoods(goods: any[], signal: AbortSignal, onGoods?: GoodsConsumer, onBatch?: GoodsBatchObserver) {
  if (goods.length) onBatch?.(goods)
  for (const item of goods) await onGoods?.(item, signal)
  return goods
}

function fixture(options: Partial<Task> = {}) {
  const task = {
    _id: 'task-1',
    taskStatus: 'noExecuted',
    taskName: 'test',
    sourceType: '1',
    aiSelectType: 1,
    targetCount: 10,
    progress: {},
    ...options,
  } as Task
  const calls: string[] = []
  const saved: any[] = []
  let stage = 0
  const visited = new Set<number>()
  const first = {
    id: '1',
    cover: 'cover',
    sellers: { sellers: [{ link: '/shop/2', rating: { totalScore: 5 } }] },
  }
  const second = { id: '2', cover: 'cover2' }
  const services: any = {
    main: {
      createCollectionWindow: async () => calls.push('open'),
      getHTML: async () => ({ html: stage, domain: 'test' }),
      getDomain: async () => 'test',
      getDataByApi: async () => ({}),
      getSellingData: async () => ({ success: false }),
      scrollPage: async () => false,
      changeUrl: async () => {
        stage++
        calls.push('expand')
      },
      destroy: () => calls.push('main.destroy'),
    },
    source: {
      createWindow: async () => ({ link1688: 'source', sourcePrice: 1, cover2: 'cover' }),
      destroy: () => calls.push('source.destroy'),
    },
    parse: {
      ozonListParser: async (_html: unknown, _domain: string, signal: AbortSignal, onGoods?: GoodsConsumer, onBatch?: GoodsBatchObserver) => {
        if (visited.has(stage)) return []
        visited.add(stage)
        return parsedGoods(stage ? [second] : [first], signal, onGoods, onBatch)
      },
      ozonDetailListParser: async (list: any[]) => list,
      ozonDetailParse: async () => ({ ...first, price: 1 }),
      getDataCount: () => visited.size,
      guessLikeList: new Set(),
      destroy: () => calls.push('parse.destroy'),
    },
    data: {
      getBaseData: async (data: any[]) => data,
      filterData: async (data: any[]) => data,
      aiFilterData: async (data: any[]) => data,
      getDetailData: async (params: any) => params.reqDatas,
      destroy: () => calls.push('data.destroy'),
    },
    excel: {
      DeleteFilled: async () => {},
      getFilePath: async () => '',
      destroy: () => calls.push('excel.destroy'),
    },
  }
  const deps: CollectionDependencies = {
    createServices: () => services,
    request: async (config) => {
      calls.push(`status:${config.data.taskStatus}`)
      return { data: { list: [], total: 0 } }
    },
    save: async ({ datas }) => {
      saved.push(...datas)
      calls.push('save:' + datas[0].id)
      return { code: 0, count: 1 }
    },
    upload: async (_task, goods) => {
      calls.push('upload:' + goods.size)
      return 'success'
    },
    log: { info() {}, warn() {}, error() {} },
    metrics() {},
    timing: { scroll: 0, detail: 0, operation: 300, item: 200, run: 2000, status: 50 },
  }
  const collection = new Collection(task, null, deps)
  return { collection, task, deps, services, calls, saved }
}

function assertReleased(calls: string[]) {
  for (const resource of ['main', 'source', 'data', 'parse', 'excel']) {
    assert.equal(calls.filter((call) => call === resource + '.destroy').length, 1, resource)
  }
}

test('state machine disallows skipping collection and reaches a terminal state only after cleanup', () => {
  const actor = createCollectionActor()
  actor.send({ type: 'START' })
  actor.send({ type: 'FINISH' })
  assert.ok(actor.getSnapshot().matches({ running: 'initializing' }))
  actor.send({ type: 'CANCEL' })
  assert.equal(actor.getSnapshot().value, 'cleaning')
  actor.send({ type: 'CLEANED' })
  assert.equal(actor.getSnapshot().value, 'cancelled')
  assert.equal(actor.getSnapshot().status, 'done')
  actor.stop()
})

test('normal completion saves before uploading, releases all services and does not rerun', async () => {
  const f = fixture({ isUseAutoUpGoods: true })
  const running = f.collection.run()
  assert.equal(f.collection.run(), running)
  const result = await running
  assert.equal(result.status, 'completed')
  assert.equal(result.upGoodsList.length, 1)
  assert.ok(f.calls.indexOf('save:1') < f.calls.indexOf('upload:1'))
  assertReleased(f.calls)
  await f.collection.clearStatus()
  assertReleased(f.calls)
})

test('1688 stage progress carries the current task and product into the existing progress output', async () => {
  const f = fixture()
  const messages: any[] = []
  f.deps.log.info = (label: string, data: any) => { if (label === '采集进度:') messages.push(data) }
  f.services.source.createWindow = async (_type: string, _cover: string, _signal: AbortSignal, context: any) => {
    assert.equal(context.taskId, 'task-1')
    assert.equal(context.goodsId, '1')
    context.onStage('等待结果商品')
    return { sourcePrice: 1 }
  }
  await f.collection.run()
  assert.ok(messages.some(data => data.taskId === 'task-1' && data.message === '商品 1：1688等待结果商品'))
  assertReleased(f.calls)
})

test('category processing count adds the whole batch then decreases once per completed product', { timeout: 3000 }, async () => {
  const f = fixture({ isUseCategorySelect: 0 })
  const ids = ['1', '2', '3', '4']
  const gates = ids.map(() => Promise.withResolvers<void>())
  const entered = Promise.withResolvers<void>()
  const counts = Array.from({ length: 4 }, () => Promise.withResolvers<void>())
  const snapshots: { message: string; current: number }[] = []
  let started = 0
  f.deps.log.info = (label: string, data: any) => {
    if (label !== '采集进度:') return
    snapshots.push({ message: data.message, current: data.progress.current })
    if (data.progress.current < 4) counts[data.progress.current]?.resolve()
  }
  f.deps.request = async config => config.url?.includes('getReMaiData')
    ? { data: { list: ids.map(_id => ({ _id })), total: 4 } } : {}
  f.services.main.getDataByApi = async (id: string) => {
    if (++started === 3) entered.resolve()
    await gates[ids.indexOf(id)]!.promise
    return {}
  }
  f.services.parse.ozonDetailParse = async (_data: unknown, _domain: string, goods: any) => ({ id: goods._id, price: 1 })
  const running = f.collection.run()
  try {
    await entered.promise
    assert.equal(f.collection.getTaskInfo().progress.current, 4)
    for (let index = 0; index < 4; index++) {
      gates[index]!.resolve()
      await counts[3 - index]!.promise
    }
    await running
    const batch = snapshots.findIndex(item => item.message === '本批新增 4 个待处理商品')
    const changes = snapshots.slice(batch).map(item => item.current).filter((count, index, values) => !index || count !== values[index - 1])
    assert.deepEqual(changes, [4, 3, 2, 1, 0])
    assert.equal(f.saved.length, 4)
  } finally { gates.forEach(gate => gate.resolve()); await f.collection.cancel(); await running.catch(() => undefined) }
})

test('a product stays counted while saving and a zero-new-count response still completes it', async () => {
  const f = fixture()
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>()
  f.deps.save = async () => { entered.resolve(); await release.promise; return { code: 0, count: 0 } }
  const running = f.collection.run()
  try {
    await entered.promise
    await new Promise(setImmediate)
    assert.equal(f.collection.getTaskInfo().progress.current, 1)
    release.resolve()
    assert.equal((await running).progress.totalCount, 0)
    assert.equal(f.collection.getTaskInfo().progress.current, 0)
  } finally { release.resolve(); await f.collection.cancel(); await running.catch(() => undefined) }
})

test('filtered, failed and rejected products each leave the batch count exactly once', async () => {
  const f = fixture()
  const values: number[] = []
  let parsed = false
  f.deps.log.info = (label: string, data: any) => { if (label === '采集进度:') values.push(data.progress.current) }
  f.services.parse.ozonListParser = async (_html: unknown, _domain: string, signal: AbortSignal, onGoods: GoodsConsumer, onBatch: GoodsBatchObserver) => {
    if (parsed) return []
    parsed = true
    return parsedGoods(['1', '2', '3', '4'].map(id => ({ id, cover: id })), signal, onGoods, onBatch)
  }
  f.services.data.filterData = async (goods: any[]) => goods.filter(item => item.id !== '2')
  f.services.source.createWindow = async (_type: string, cover: string) => {
    if (cover === '3') throw new Error('image search failed')
    return {}
  }
  f.services.data.getDetailData = async ({ reqDatas }: any) => reqDatas[0].id === '4' ? [] : reqDatas
  const result = await f.collection.run()
  assert.equal(result.upGoodsList.length, 1)
  assert.equal(f.collection.getTaskInfo().progress.current, 0)
  const changes = values.slice(values.indexOf(4)).filter((count, index, all) => !index || count !== all[index - 1])
  assert.deepEqual(changes, [4, 3, 2, 1, 0])
})

test('later pages add their whole batch to the remaining count without per-item increments', { timeout: 3000 }, async () => {
  const f = fixture()
  const gate = Promise.withResolvers<void>(), secondBatch = Promise.withResolvers<void>()
  let page = 0
  const counts: number[] = []
  f.deps.log.info = (label: string, data: any) => {
    if (label !== '采集进度:') return
    counts.push(data.progress.current)
    if (data.message === '本批新增 3 个待处理商品') secondBatch.resolve()
  }
  f.services.main.scrollPage = async () => { page++; return true }
  f.services.parse.ozonListParser = async (_html: unknown, _domain: string, signal: AbortSignal, onGoods: GoodsConsumer, onBatch: GoodsBatchObserver) =>
    parsedGoods((page === 0 ? ['1', '2'] : page === 1 ? ['3', '4', '5'] : []).map(id => ({ id, cover: id })), signal, onGoods, onBatch)
  f.services.source.createWindow = async () => { await gate.promise; return {} }
  const running = f.collection.run()
  try {
    await secondBatch.promise
    assert.equal(f.collection.getTaskInfo().progress.current, 5)
    assert.deepEqual(counts.filter((count, index, all) => !index || count !== all[index - 1]), [0, 2, 5])
    gate.resolve()
    await running
    assert.equal(f.collection.getTaskInfo().progress.current, 0)
    assert.equal(f.saved.length, 5)
  } finally { gate.resolve(); await f.collection.cancel(); await running.catch(() => undefined) }
})

test('a timed-out legacy item is deducted even if its underlying promise never resolves', async () => {
  const f = fixture()
  f.deps.timing!.item = 20
  f.services.source.createWindow = async () => new Promise(() => {})
  const values: number[] = []
  f.deps.log.info = (label: string, data: any) => { if (label === '采集进度:') values.push(data.progress.current) }
  const result = await f.collection.run()
  assert.equal(result.status, 'completed')
  assert.ok(values.includes(1))
  assert.equal(f.collection.getTaskInfo().progress.current, 0)
})

test('producer requests are awaited before deciding queues are empty', async () => {
  const f = fixture()
  const gate = Promise.withResolvers<any[]>()
  f.services.data.getBaseData = () => gate.promise
  let finished = false
  const running = f.collection.run().finally(() => {
    finished = true
  })
  await delay(15)
  assert.equal(finished, false)
  gate.resolve([{ id: '1', cover: 'cover' }])
  assert.equal((await running).upGoodsList.length, 1)
  assertReleased(f.calls)
})

test('category dispatches all details and continues pagination while earlier requests remain in flight', { timeout: 2000 }, async () => {
  const f = fixture({ isUseCategorySelect: 0 })
  const ids = ['1', '2', '3', '4']
  const gates = ids.map(() => Promise.withResolvers<void>())
  const entered = Promise.withResolvers<void>(), saved = Promise.withResolvers<void>()
  const started: string[] = []
  let active = 0, peak = 0
  const pagesRequested: number[] = []
  f.deps.request = async config => {
    if (!config.url?.includes('getReMaiData')) return {}
    const pageNo = config.data.pageNo
    pagesRequested.push(pageNo)
    return { data: { list: ids.slice((pageNo - 1) * 2, pageNo * 2).map(_id => ({ _id })), total: 60 } }
  }
  f.services.main.getDataByApi = async (id: string) => {
    started.push(id)
    peak = Math.max(peak, ++active)
    if (started.length === 4) entered.resolve()
    await gates[ids.indexOf(id)]!.promise
    active--
    return {}
  }
  f.services.parse.ozonDetailParse = async (_response: any, _domain: string, goods: any) => ({ id: goods._id, price: 1 })
  const save = f.deps.save
  f.deps.save = async (...args) => { const result = await save(...args); saved.resolve(); return result }
  const running = f.collection.run()
  try {
    await entered.promise
    assert.deepEqual(started, ids)
    assert.deepEqual(pagesRequested, [1, 2])
    gates[0]!.resolve()
    await saved.promise
    assert.equal(f.saved[0].id, '1')
    assert.equal(active >= 2, true)
    for (const gate of gates) gate.resolve()
    const result = await running
    assert.equal(result.upGoodsList.length, 4)
    assert.equal(peak, 4)
    assertReleased(f.calls)
  } finally { for (const gate of gates) gate.resolve(); await f.collection.cancel(); await running.catch(() => undefined) }
})

test('page scrolling starts all four base-data batches without a batch concurrency cap', async () => {
  const f = fixture()
  const gate = Promise.withResolvers<void>(), overlap = Promise.withResolvers<void>()
  let page = 0, calls = 0
  f.services.main.scrollPage = async () => { page++; return true }
  f.services.parse.ozonListParser = async (_html: unknown, _domain: string, signal: AbortSignal, onGoods?: GoodsConsumer, onBatch?: GoodsBatchObserver) =>
    parsedGoods(page < 4 ? [{ id: String(page + 1), cover: 'cover' }] : [], signal, onGoods, onBatch)
  f.services.data.getBaseData = async (goods: any[]) => {
    calls++
    if (calls === 4) overlap.resolve()
    await gate.promise
    return goods
  }
  const running = f.collection.run()
  try {
    await overlap.promise
    assert.equal(calls, 4)
    assert.ok(page >= 3)
    gate.resolve()
    assert.equal((await running).upGoodsList.length, 4)
    assertReleased(f.calls)
  } finally { gate.resolve(); await f.collection.cancel(); await running.catch(() => undefined) }
})

test('category defaults to one second between launches while earlier detail requests remain in flight', { timeout: 4000 }, async () => {
  const f = fixture({ isUseCategorySelect: 0 })
  delete f.deps.timing!.detail
  f.deps.timing!.run = 3500
  const gate = Promise.withResolvers<void>(), entered = Promise.withResolvers<void>()
  const starts: number[] = []
  let listedAt = 0
  f.deps.request = async config => {
    if (!config.url?.includes('getReMaiData')) return {}
    listedAt = performance.now()
    return { data: { list: ['1', '2'].map(_id => ({ _id })), total: 2 } }
  }
  f.services.main.getDataByApi = async () => {
    starts.push(performance.now())
    if (starts.length === 2) entered.resolve()
    await gate.promise
    return {}
  }
  f.services.parse.ozonDetailParse = async (_data: unknown, _domain: string, goods: any) => ({ id: goods._id, price: 1 })
  const running = f.collection.run()
  try {
    await entered.promise
    assert.ok(starts[0]! - listedAt >= 900)
    assert.ok(starts[1]! - starts[0]! >= 900)
    assert.equal(f.saved.length, 0)
    gate.resolve()
    assert.equal((await running).upGoodsList.length, 2)
    assertReleased(f.calls)
  } finally { gate.resolve(); await f.collection.cancel(); await running.catch(() => undefined) }
})

test('one category Failed to fetch does not cancel other products or prevent successful saving', async () => {
  const f = fixture({ isUseCategorySelect: 0 })
  const warnings: any[] = []
  f.deps.log.warn = (...args) => warnings.push(args)
  f.deps.request = async config => config.url?.includes('getReMaiData')
    ? { data: { list: ['1', '2', '3'].map(_id => ({ _id })), total: 3 } } : {}
  f.services.main.getDataByApi = async (id: string) => {
    if (id === '1') throw new Error('Failed to fetch')
    return {}
  }
  f.services.parse.ozonDetailParse = async (_data: unknown, _domain: string, goods: any) => ({ id: goods._id, price: 1 })
  const result = await f.collection.run()
  assert.equal(result.status, 'completed')
  assert.deepEqual(result.upGoodsList.map(goods => goods.id), ['2', '3'])
  assert.equal(f.collection.getTaskInfo().progress.current, 0)
  assert.ok(warnings.some(([label, data]) => label === '分类商品请求失败，跳过该商品:' && data.goodsId === '1' && data.taskId === f.task._id))
  assertReleased(f.calls)
})

test('category verification failure remains fatal and aborts its other detail requests', async () => {
  const f = fixture({ isUseCategorySelect: 0 })
  const failure = Promise.withResolvers<any>(), entered = Promise.withResolvers<void>()
  let aborted = false
  f.deps.request = async config => config.url?.includes('getReMaiData')
    ? { data: { list: ['1', '2'].map(_id => ({ _id })), total: 2 } } : {}
  f.services.main.getDataByApi = async (id: string, signal: AbortSignal) => {
    if (id === '1') return failure.promise
    signal.addEventListener('abort', () => { aborted = true }, { once: true })
    entered.resolve()
    return new Promise(() => {})
  }
  const running = f.collection.run()
  const rejected = assert.rejects(running, (error: any) => error.result?.status === 'failed' && error.result.error === 'verification exhausted')
  await entered.promise
  failure.reject(new VerificationFailedError('verification exhausted'))
  await rejected
  assert.equal(aborted, true)
  assert.equal(f.saved.length, 0)
  assertReleased(f.calls)
})

test('cancellation interrupts the category launch delay before another request starts', async () => {
  const f = fixture({ isUseCategorySelect: 0 })
  f.deps.timing!.detail = 10_000
  const listed = Promise.withResolvers<void>()
  let started = 0
  f.deps.request = async config => {
    if (!config.url?.includes('getReMaiData')) return {}
    listed.resolve()
    return { data: { list: [{ _id: '1' }], total: 1 } }
  }
  f.services.main.getDataByApi = async () => { started++; return {} }
  const running = f.collection.run()
  const rejected = assert.rejects(running, (error: any) => error.result?.status === 'cancelled')
  await listed.promise
  await f.collection.cancel()
  await rejected
  assert.equal(started, 0)
  assertReleased(f.calls)
})

test('category pauses the next page above 20 and resumes at exactly 20 without deadlocking the registered batch', { timeout: 6000 }, async () => {
  const f = fixture({ isUseCategorySelect: 0, targetCount: 100 })
  const gates = Array.from({ length: 60 }, () => Promise.withResolvers<void>())
  const entered = Promise.withResolvers<void>(), sourceEntered = Promise.withResolvers<void>()
  const paused = Promise.withResolvers<void>(), at21 = Promise.withResolvers<void>()
  const requested: string[] = []
  const pagesRequested: number[] = []
  let sourceStarted = 0, secondPageAt = -1
  f.deps.timing = { ...f.deps.timing, item: 4000, run: 5000 }
  f.deps.log.info = (label: string, data: any) => {
    if (label === '采集背压等待:') paused.resolve()
    if (label === '采集进度:' && data.progress.current === 21) at21.resolve()
  }
  f.deps.request = async config => {
    if (!config.url?.includes('getReMaiData')) return {}
    pagesRequested.push(config.data.pageNo)
    if (config.data.pageNo === 2) secondPageAt = f.collection.getTaskInfo().progress.current
    return { data: { list: Array.from({ length: 30 }, (_, i) => ({ _id: String((config.data.pageNo - 1) * 30 + i + 1) })), total: 60 } }
  }
  f.services.main.getDataByApi = async (id: string) => {
    requested.push(id)
    if (requested.length === 60) entered.resolve()
    return {}
  }
  f.services.parse.ozonDetailParse = async (_data: unknown, _domain: string, goods: any) => ({ id: goods._id, cover: goods._id, price: 1 })
  f.services.source.createWindow = async (_type: string, cover: string) => {
    if (++sourceStarted === 3) sourceEntered.resolve()
    await gates[Number(cover) - 1]!.promise
    return {}
  }
  const running = f.collection.run()
  try {
    await Promise.all([paused.promise, sourceEntered.promise])
    assert.deepEqual(pagesRequested, [1])
    assert.equal(requested.length, 30)
    assert.equal(sourceStarted, 3)
    assert.equal(f.collection.getTaskInfo().progress.current, 30)
    gates.slice(0, 9).forEach(gate => gate.resolve())
    await at21.promise
    await new Promise(setImmediate)
    assert.deepEqual(pagesRequested, [1])
    assert.equal(f.collection.getTaskInfo().progress.current, 21)
    gates[9]!.resolve()
    await entered.promise
    assert.equal(secondPageAt, 20)
    assert.deepEqual(pagesRequested, [1, 2])
    assert.equal(requested.length, 60)
    gates.forEach(gate => gate.resolve())
    assert.equal((await running).upGoodsList.length, 60)
    assertReleased(f.calls)
  } finally { gates.forEach(gate => gate.resolve()); await f.collection.cancel(); await running.catch(() => undefined) }
})

test('a full page requests base data once for all products instead of once per product', async () => {
  const f = fixture({ targetCount: 100 })
  const ids = Array.from({ length: 30 }, (_, index) => String(index + 1))
  const baseCalls: string[][] = []
  let parsed = false
  f.services.parse.ozonListParser = async (_html: unknown, _domain: string, signal: AbortSignal, onGoods: GoodsConsumer, onBatch: GoodsBatchObserver) => {
    if (parsed) return []
    parsed = true
    return parsedGoods(ids.map(id => ({ id, cover: id, sellerNumber: 2 })), signal, onGoods, onBatch)
  }
  f.services.data.getBaseData = async (goods: any[]) => {
    baseCalls.push(goods.map(item => item.id))
    return goods.map(item => ({ ...item, productId: item.id, salesDynamics: 100 }))
  }
  const result = await f.collection.run()
  assert.deepEqual(baseCalls, [ids])
  assert.equal(result.upGoodsList.length, 30)
  assert.ok(result.upGoodsList.every(item => item.sellerNumber === 2 && item.salesDynamics === 100))
  assertReleased(f.calls)
})

test('batch filtering retains its operation deadline while a page batch waits for streamed products', async () => {
  const f = fixture()
  f.deps.timing!.operation = 20
  f.services.data.filterData = async () => new Promise(() => {})
  await assert.rejects(f.collection.run(), (error: any) =>
    error instanceof CollectionRunError && error.result.status === 'failed' && error.result.error === '筛选基础数据超时')
  assert.equal(f.saved.length, 0)
  assertReleased(f.calls)
})

test('scrolling continues with 15 outstanding products while the three item workers remain busy', { timeout: 2000 }, async () => {
  const f = fixture({ targetCount: 100 })
  const release = Promise.withResolvers<void>(), scrolled = Promise.withResolvers<void>()
  let parsed = false, active = 0
  f.services.parse.ozonListParser = async (_html: unknown, _domain: string, signal: AbortSignal, onGoods: GoodsConsumer, onBatch: GoodsBatchObserver) => {
    if (parsed) return []
    parsed = true
    return parsedGoods(Array.from({ length: 15 }, (_, index) => ({ id: String(index), cover: 'cover' })), signal, onGoods, onBatch)
  }
  f.services.source.createWindow = async () => { active++; await release.promise; active--; return {} }
  f.services.main.scrollPage = async () => { scrolled.resolve(); return false }
  const running = f.collection.run()
  try {
    await scrolled.promise
    assert.equal(active, 3)
    assert.equal(f.saved.length, 0)
    assert.equal(f.collection.getTaskInfo().progress.current, 15)
    release.resolve()
    assert.equal((await running).upGoodsList.length, 15)
  } finally { release.resolve(); await f.collection.cancel(); await running.catch(() => undefined) }
})

const pageCards = `<div id="contentScrollPaginator">${['1', '2', '3'].map(id =>
  `<article><a href="/product/item-${id}/"><img src="${id}.png"></a><span class="tsHeadline500Medium">100 ₽</span></article>`,
).join('')}</div>`
const sellerResponse = { success: true, data: { widgetStates: {} } }

test('page seller timeouts deduct failed products, release backpressure and allow peers to save', { timeout: 3000 }, async () => {
  const f = fixture({ targetCount: 100 })
  const gate = Promise.withResolvers<void>(), skipped = Promise.withResolvers<void>()
  const snapshots: number[] = []
  let reads = 0, failures = 0, scrolls = 0, peerAborted = false
  const page = `<div id="contentScrollPaginator">${Array.from({ length: 24 }, (_, index) =>
    `<article><a href="/product/item-${index + 1}/"><img src="cover.png"></a><span class="tsHeadline500Medium">100 ₽</span></article>`,
  ).join('')}</div>`
  f.services.main.getHTML = async () => ({ html: reads++ ? '' : page, domain: 'https://www.ozon.ru' })
  f.services.main.scrollPage = async () => { scrolls++; return false }
  f.services.parse = new ParseService({ getSellingData: async (url, signal) => {
    const id = Number(decodeURIComponent(url).match(/product_id=(\d+)/)![1])
    if (id <= 21) throw new TaskTimeoutError('OZON 接口请求')
    signal!.addEventListener('abort', () => { peerAborted = true }, { once: true })
    await gate.promise
    return sellerResponse
  } }, { error() {} })
  const destroy = f.services.parse.destroy.bind(f.services.parse)
  f.services.parse.destroy = () => { f.calls.push('parse.destroy'); destroy() }
  f.deps.log.warn = (label: string, data: any) => {
    if (label === '页面商品跟卖请求失败，跳过该商品:') {
      assert.equal(data.taskId, f.task._id)
      if (++failures === 21) skipped.resolve()
    }
  }
  f.deps.log.info = (label: string, data: any) => { if (label === '采集进度:') snapshots.push(data.progress.current) }
  const running = f.collection.run()
  try {
    await skipped.promise
    await new Promise(setImmediate)
    assert.equal(f.collection.getTaskInfo().progress.current, 3)
    assert.equal(f.collection.getTaskInfo().progress.total, 24)
    assert.equal(peerAborted, false)
    gate.resolve()
    const result = await running
    assert.equal(result.status, 'completed')
    assert.equal(result.progress.totalCount, 3)
    assert.deepEqual(result.upGoodsList.map(goods => goods.id), ['22', '23', '24'])
    assert.equal(f.collection.getTaskInfo().progress.current, 0)
    assert.ok(snapshots.includes(24) && snapshots.includes(20) && snapshots.includes(3))
    assert.ok(scrolls > 0)
    assertReleased(f.calls)
  } finally { gate.resolve(); await f.collection.cancel(); await running.catch(() => undefined) }
})

test('a ready page product reaches saving while other seller requests are still pending', { timeout: 2000 }, async () => {
  const f = fixture()
  const entered = Promise.withResolvers<void>(), saved = Promise.withResolvers<void>()
  const gates = ['1', '2', '3'].map(() => Promise.withResolvers<any>())
  let active = 0, started = 0
  const baseBatches: string[][] = []
  f.services.data.getBaseData = async (goods: any[]) => { baseBatches.push(goods.map(item => item.id)); return goods }
  const totals: number[] = []
  f.deps.log.info = (label: string, data: any) => { if (label === '采集进度:') totals.push(data.progress.total) }
  f.services.parse = new ParseService({ getSellingData: async url => {
    const id = Number(decodeURIComponent(url).match(/product_id=(\d+)/)![1])
    active++
    if (++started === 3) entered.resolve()
    try { return await gates[id - 1]!.promise }
    finally { active-- }
  } })
  const destroy = f.services.parse.destroy.bind(f.services.parse)
  f.services.parse.destroy = () => { f.calls.push('parse.destroy'); destroy() }
  f.services.main.getHTML = async () => ({ html: pageCards, domain: 'https://www.ozon.ru' })
  const save = f.deps.save
  f.deps.save = async (...args) => { const result = await save(...args); saved.resolve(); return result }
  const running = f.collection.run()
  try {
    await entered.promise
    assert.equal(f.collection.getTaskInfo().progress.current, 3)
    assert.equal(f.collection.getTaskInfo().progress.total, 3)
    gates[0]!.resolve(sellerResponse)
    await saved.promise
    await new Promise(setImmediate)
    assert.equal(f.collection.getTaskInfo().progress.current, 2)
    assert.equal(f.collection.getTaskInfo().progress.total, 3)
    assert.equal(f.saved[0].id, '1')
    assert.equal(active, 2)
    assert.deepEqual(baseBatches, [['1', '2', '3']])
    gates.forEach(gate => gate.resolve(sellerResponse))
    assert.equal((await running).upGoodsList.length, 3)
    assert.deepEqual(totals.filter((value, index, all) => !index || value !== all[index - 1]), [0, 3])
    assertReleased(f.calls)
  } finally {
    gates.forEach(gate => gate.resolve(sellerResponse))
    await f.collection.cancel()
    await running.catch(() => undefined)
  }
})

test('category cumulative count includes every deduplicated page product even when all products are filtered out', async () => {
  const f = fixture({ isUseCategorySelect: 0 })
  const pages = [
    Array.from({ length: 30 }, (_, index) => ({ _id: String(index + 1) })),
    Array.from({ length: 21 }, (_, index) => ({ _id: String(index + 20) })),
  ]
  f.services.parse = new ParseService({ getSellingData: async () => { throw new Error('filtered products must not request sellers') } })
  const destroy = f.services.parse.destroy.bind(f.services.parse)
  f.services.parse.destroy = () => { f.calls.push('parse.destroy'); destroy() }
  f.services.data.filterData = async () => []
  const totals: number[] = []
  f.deps.log.info = (label: string, data: any) => {
    if (label === '采集进度:' && data.message.includes('本批爬取')) totals.push(data.progress.total)
  }
  f.deps.request = async config => config.url?.includes('getReMaiData')
    ? { data: { list: pages[config.data.pageNo - 1], total: 60 } } : {}
  const result = await f.collection.run()
  assert.deepEqual(totals, [30, 40])
  assert.equal(result.progress.total, 40)
  assert.equal(result.upGoodsList.length, 0)
  assert.equal(f.collection.getTaskInfo().progress.total, 40)
  assertReleased(f.calls)
})

test('reaching the page target aborts pending seller requests without waiting for the whole page', { timeout: 2000 }, async () => {
  const f = fixture({ targetCount: 1 })
  const entered = Promise.withResolvers<void>()
  let started = 0, aborted = 0
  f.services.parse = new ParseService({ getSellingData: async (url, signal) => {
    if (++started === 3) entered.resolve()
    if (decodeURIComponent(url).includes('product_id=1&')) { await entered.promise; return sellerResponse }
    signal!.addEventListener('abort', () => aborted++, { once: true })
    return new Promise(() => {})
  } })
  const destroy = f.services.parse.destroy.bind(f.services.parse)
  f.services.parse.destroy = () => { f.calls.push('parse.destroy'); destroy() }
  f.services.main.getHTML = async () => ({ html: pageCards, domain: 'https://www.ozon.ru' })
  const result = await f.collection.run()
  assert.equal(result.status, 'completed')
  assert.equal(result.upGoodsList.length, 1)
  assert.equal(aborted, 2)
  assertReleased(f.calls)
})

test('a paced detail failure stops the launch interval and aborts already started work', async () => {
  const failure = Promise.withResolvers<void>(), entered = Promise.withResolvers<void>()
  let calls = 0, intervalAborted = false
  const running = mapPaced([1, 2, 3], async () => { calls++; return failure.promise }, async signal => {
    entered.resolve()
    signal.addEventListener('abort', () => { intervalAborted = true }, { once: true })
    await new Promise(() => {})
  })
  const rejected = assert.rejects(running, /detail failed/)
  await entered.promise
  failure.reject(new Error('detail failed'))
  await rejected
  assert.equal(calls, 1)
  assert.equal(intervalAborted, true)
})

test('page scrolling pauses at 21, resumes at 20 and pauses again when the next product is registered', { timeout: 6000 }, async () => {
  const f = fixture({ targetCount: 100 })
  f.deps.timing!.item = 2000
  f.deps.timing!.run = 5000
  const gates = Array.from({ length: 22 }, () => Promise.withResolvers<void>())
  const pauses = [Promise.withResolvers<void>(), Promise.withResolvers<void>()]
  const entered = Promise.withResolvers<void>()
  let pauseCount = 0
  let sellerRequests = 0, sourceStarted = 0, scrolls = 0
  const stopReasons: string[] = []
  f.deps.log.info = (label: string, data: any) => {
    if (label === '采集背压等待:') pauses[pauseCount++]?.resolve()
    if (label === '页面采集停止:') stopReasons.push(data.reason)
  }
  f.services.main.scrollPage = async () => { scrolls++; return false }
  const cards = (ids: number[]) => `<div id="contentScrollPaginator">${ids.map(id =>
    `<article><a href="/product/item-${id}/"><img src="${id}.png"></a><span class="tsHeadline500Medium">100 ₽</span></article>`,
  ).join('')}</div>`
  f.services.main.getHTML = async () => ({ html: cards(Array.from({ length: scrolls ? 22 : 21 }, (_, i) => i + 1)), domain: 'https://www.ozon.ru' })
  f.services.parse = new ParseService({ getSellingData: async () => { sellerRequests++; return sellerResponse } })
  const destroy = f.services.parse.destroy.bind(f.services.parse)
  f.services.parse.destroy = () => { f.calls.push('parse.destroy'); destroy() }
  f.services.source.createWindow = async (_type: string, cover: string) => {
    if (++sourceStarted === 3) entered.resolve()
    await gates[Number(cover.replace('.png', '')) - 1]!.promise
    return {}
  }
  const running = f.collection.run()
  try {
    await Promise.all([pauses[0]!.promise, entered.promise])
    await new Promise(setImmediate)
    assert.equal(sourceStarted, 3)
    assert.equal(f.collection.getTaskInfo().progress.current, 21)
    assert.equal(sellerRequests, 21)
    assert.equal(scrolls, 0)
    gates[0]!.resolve()
    await pauses[1]!.promise
    assert.equal(f.collection.getTaskInfo().progress.current, 21)
    assert.equal(f.collection.getTaskInfo().progress.total, 22)
    assert.equal(sellerRequests, 22)
    assert.equal(scrolls, 1)
    gates.forEach(gate => gate.resolve())
    assert.equal((await running).upGoodsList.length, 22)
    assert.deepEqual(stopReasons, ['连续3次触底'])
    assertReleased(f.calls)
  } finally { gates.forEach(gate => gate.resolve()); await f.collection.cancel(); await running.catch(() => undefined) }
})

test('cancelling a 1688 backlog stops promptly and cannot save late goods', { timeout: 2000 }, async () => {
  const f = fixture({ targetCount: 100 })
  const entered = Promise.withResolvers<void>(), paused = Promise.withResolvers<void>()
  let sourceStarted = 0, parsed = false
  f.deps.timing!.item = 2000
  f.deps.log.info = (label: string) => { if (label === '采集背压等待:') paused.resolve() }
  f.services.parse.ozonListParser = async (_html: unknown, _domain: string, signal: AbortSignal, onGoods: GoodsConsumer, onBatch?: GoodsBatchObserver) => {
    if (parsed) return []
    parsed = true
    return parsedGoods(Array.from({ length: 40 }, (_, index) => ({ id: String(index), cover: 'cover' })), signal, onGoods, onBatch)
  }
  f.services.source.createWindow = async () => { if (++sourceStarted === 3) entered.resolve(); return new Promise(() => {}) }
  const running = f.collection.run()
  const rejected = assert.rejects(running, (error: any) => error instanceof CollectionRunError && error.result.status === 'cancelled')
  await Promise.all([entered.promise, paused.promise])
  await f.collection.cancel()
  await rejected
  assert.equal(f.saved.length, 0)
  assert.equal(f.collection.getTaskInfo().progress.current, 0)
  assertReleased(f.calls)
})

test('1688 slots are released before slow downstream filtering and all saves can overlap', { timeout: 4000 }, async () => {
  const f = fixture({ targetCount: 100 })
  const goods = Array.from({ length: 6 }, (_, index) => ({ id: String(index + 1), cover: 'cover' }))
  const detailGate = Promise.withResolvers<void>(), saveGate = Promise.withResolvers<void>()
  const detailsEntered = Promise.withResolvers<void>(), savesEntered = Promise.withResolvers<void>()
  let parsed = false, sourceActive = 0, sourcePeak = 0, details = 0, saves = 0
  f.deps.timing = { ...f.deps.timing, item: 2000, operation: 2000, run: 3000 }
  f.services.parse.ozonListParser = async (_html: unknown, _domain: string, signal: AbortSignal, onGoods: GoodsConsumer, onBatch: GoodsBatchObserver) => {
    if (parsed) return []
    parsed = true
    return parsedGoods(goods, signal, onGoods, onBatch)
  }
  f.services.source.createWindow = async () => {
    sourcePeak = Math.max(sourcePeak, ++sourceActive)
    await new Promise(setImmediate)
    sourceActive--
    return {}
  }
  f.services.data.getDetailData = async ({ reqDatas }: any) => {
    if (++details === 6) detailsEntered.resolve()
    await detailGate.promise
    return reqDatas
  }
  const save = f.deps.save
  f.deps.save = async (...args) => {
    if (++saves === 6) savesEntered.resolve()
    await saveGate.promise
    return save(...args)
  }
  const running = f.collection.run()
  try {
    await detailsEntered.promise
    assert.equal(sourceActive, 0)
    assert.equal(sourcePeak, 3)
    assert.equal(saves, 0)
    assert.equal(f.collection.getTaskInfo().progress.current, 6)
    detailGate.resolve()
    await savesEntered.promise
    assert.equal(saves, 6)
    assert.equal(f.saved.length, 0)
    assert.equal(f.collection.getTaskInfo().progress.current, 6)
    saveGate.resolve()
    assert.equal((await running).upGoodsList.length, 6)
    assertReleased(f.calls)
  } finally { detailGate.resolve(); saveGate.resolve(); await f.collection.cancel(); await running.catch(() => undefined) }
})

test('eight collections each own three 1688 slots while every collection continues OZON requests', { timeout: 5000 }, async () => {
  const owners = Array.from({ length: 8 }, (_, index) => {
    const f = fixture({ _id: `task-${index}`, targetCount: 100 })
    const sourceGate = Promise.withResolvers<void>(), sourceEntered = Promise.withResolvers<void>(), nextSeller = Promise.withResolvers<void>()
    let page = 0, sourceStarted = 0
    const sellerIds: string[] = []
    f.deps.timing = { ...f.deps.timing, item: 3000, operation: 3000, run: 4000 }
    f.services.parse = new ParseService({ getSellingData: async url => {
      const id = decodeURIComponent(url).match(/product_id=(\d+)/)![1]!
      sellerIds.push(id)
      if (id === '4') nextSeller.resolve()
      return sellerResponse
    } })
    const destroy = f.services.parse.destroy.bind(f.services.parse)
    f.services.parse.destroy = () => { f.calls.push('parse.destroy'); destroy() }
    f.services.main.getHTML = async () => ({ html: page ? pageCards.replace(/item-3/g, 'item-4') : pageCards, domain: 'https://www.ozon.ru' })
    f.services.main.scrollPage = async () => { page++; return false }
    f.services.source.createWindow = async () => {
      if (++sourceStarted === 3) sourceEntered.resolve()
      await sourceGate.promise
      return {}
    }
    const running = f.collection.run()
    // Observe cancellation failures as soon as the runs start.
    void running.catch(() => undefined)
    return { f, sourceGate, sourceEntered, nextSeller, sellerIds, running, started: () => sourceStarted }
  })
  try {
    await Promise.all(owners.flatMap(owner => [owner.sourceEntered.promise, owner.nextSeller.promise]))
    for (const owner of owners) {
      assert.equal(owner.started(), 3)
      assert.deepEqual(owner.sellerIds, ['1', '2', '3', '4'])
      assert.equal(owner.f.saved.length, 0)
      assert.equal(owner.f.collection.getTaskInfo().progress.total, 4)
    }
    owners[0]!.sourceGate.resolve()
    assert.equal((await owners[0]!.running).upGoodsList.length, 4)
    for (const owner of owners.slice(1)) {
      assert.equal(owner.started(), 3)
      assert.equal(owner.f.saved.length, 0)
    }
  } finally {
    await Promise.all(owners.map(owner => owner.f.collection.cancel()))
    owners.forEach(owner => owner.sourceGate.resolve())
    await Promise.allSettled(owners.map(owner => owner.running))
    owners.forEach(owner => assertReleased(owner.f.calls))
  }
})

test('three paused collections finish products independently and resume only their own producer at 20', { timeout: 6000 }, async () => {
  const owners = Array.from({ length: 3 }, (_, ownerIndex) => {
    const f = fixture({ _id: `parallel-${ownerIndex}`, targetCount: 100 })
    const gates = Array.from({ length: 30 }, () => Promise.withResolvers<void>())
    const paused = Promise.withResolvers<void>(), sourceEntered = Promise.withResolvers<void>(), scrolled = Promise.withResolvers<void>()
    const counts: number[] = []
    let parsed = false, active = 0, peak = 0, scrolls = 0
    f.deps.timing = { ...f.deps.timing, item: 4000, run: 5000 }
    f.deps.log.info = (label: string, data: any) => {
      if (label === '采集背压等待:') paused.resolve()
      if (label === '采集进度:') counts.push(data.progress.current)
    }
    f.services.parse.ozonListParser = async (_html: unknown, _domain: string, signal: AbortSignal, onGoods: GoodsConsumer, onBatch: GoodsBatchObserver) => {
      if (parsed) return []
      parsed = true
      return parsedGoods(gates.map((_gate, index) => ({ id: String(index + 1), cover: String(index + 1) })), signal, onGoods, onBatch)
    }
    f.services.source.createWindow = async (_type: string, cover: string) => {
      peak = Math.max(peak, ++active)
      if (active === 3) sourceEntered.resolve()
      try { await gates[Number(cover) - 1]!.promise; return {} }
      finally { active-- }
    }
    f.services.main.scrollPage = async () => { scrolls++; scrolled.resolve(); return false }
    const running = f.collection.run()
    void running.catch(() => undefined)
    return { f, gates, paused, sourceEntered, scrolled, counts, running, active: () => active, peak: () => peak, scrolls: () => scrolls }
  })
  try {
    await Promise.all(owners.flatMap(owner => [owner.paused.promise, owner.sourceEntered.promise]))
    for (const owner of owners) {
      assert.equal(owner.active(), 3)
      assert.equal(owner.scrolls(), 0)
      assert.equal(owner.f.collection.getTaskInfo().progress.current, 30)
    }
    owners[0]!.gates.slice(0, 10).forEach(gate => gate.resolve())
    await owners[0]!.scrolled.promise
    assert.equal(owners[0]!.f.collection.getTaskInfo().progress.current, 20)
    for (const owner of owners.slice(1)) {
      assert.equal(owner.scrolls(), 0)
      assert.equal(owner.f.collection.getTaskInfo().progress.current, 30)
    }
    owners.slice(1).forEach(owner => owner.gates.slice(0, 10).forEach(gate => gate.resolve()))
    await Promise.all(owners.slice(1).map(owner => owner.scrolled.promise))
    for (const owner of owners) {
      assert.equal(owner.f.collection.getTaskInfo().progress.current, 20)
      assert.equal(owner.f.saved.length, 10)
      assert.equal(owner.peak(), 3)
      assert.ok(owner.counts.includes(29) && owner.counts.includes(21) && owner.counts.includes(20))
    }
    owners.forEach(owner => owner.gates.forEach(gate => gate.resolve()))
    const results = await Promise.all(owners.map(owner => owner.running))
    assert.deepEqual(results.map(result => result.upGoodsList.length), [30, 30, 30])
  } finally {
    owners.forEach(owner => owner.gates.forEach(gate => gate.resolve()))
    await Promise.all(owners.map(owner => owner.f.collection.cancel()))
    await Promise.allSettled(owners.map(owner => owner.running))
    owners.forEach(owner => assertReleased(owner.f.calls))
  }
})

test('producer backpressure uses displayed processing count including saves after all 1688 slots are free', async () => {
  const f = fixture({ targetCount: 100 })
  const gates = Array.from({ length: 21 }, () => Promise.withResolvers<void>())
  const savesEntered = Promise.withResolvers<void>(), scrolled = Promise.withResolvers<void>()
  let parsed = false, saves = 0, scrolls = 0
  f.services.parse.ozonListParser = async (_html: unknown, _domain: string, signal: AbortSignal, onGoods: GoodsConsumer, onBatch: GoodsBatchObserver) => {
    if (parsed) return []
    parsed = true
    return parsedGoods(gates.map((_gate, index) => ({ id: String(index + 1), cover: 'cover' })), signal, onGoods, onBatch)
  }
  const save = f.deps.save
  f.deps.save = async (...args) => {
    if (++saves === 21) savesEntered.resolve()
    await gates[Number(args[0].datas[0].id) - 1]!.promise
    return save(...args)
  }
  f.services.main.scrollPage = async () => { scrolls++; scrolled.resolve(); return false }
  const running = f.collection.run()
  try {
    await savesEntered.promise
    assert.equal(f.collection.getTaskInfo().progress.current, 21)
    assert.equal(scrolls, 0)
    gates[0]!.resolve()
    await scrolled.promise
    assert.equal(f.collection.getTaskInfo().progress.current, 20)
    gates.forEach(gate => gate.resolve())
    assert.equal((await running).upGoodsList.length, 21)
    assertReleased(f.calls)
  } finally { gates.forEach(gate => gate.resolve()); await f.collection.cancel(); await running.catch(() => undefined) }
})

test('parallel saving reserves only the remaining goal and retries space released by zero-count saves', { timeout: 3000 }, async () => {
  const f = fixture({ targetCount: 2 })
  const gates = Array.from({ length: 3 }, () => Promise.withResolvers<void>())
  const entered = Array.from({ length: 3 }, () => Promise.withResolvers<void>())
  let parsed = false, saves = 0
  f.deps.timing = { ...f.deps.timing, item: 2000, operation: 2000 }
  f.services.parse.ozonListParser = async (_html: unknown, _domain: string, signal: AbortSignal, onGoods: GoodsConsumer, onBatch: GoodsBatchObserver) => {
    if (parsed) return []
    parsed = true
    return parsedGoods(Array.from({ length: 6 }, (_, index) => ({ id: String(index + 1), cover: 'cover' })), signal, onGoods, onBatch)
  }
  f.deps.save = async ({ datas }) => {
    const index = saves++
    entered[index]?.resolve()
    await gates[index]?.promise
    if (index > 0) f.saved.push(...datas)
    return { code: 0, count: index === 0 ? 0 : 1 }
  }
  const running = f.collection.run()
  try {
    await entered[1]!.promise
    await new Promise(setImmediate)
    assert.equal(saves, 2)
    gates[0]!.resolve()
    await entered[2]!.promise
    assert.equal(saves, 3)
    gates[1]!.resolve()
    gates[2]!.resolve()
    const result = await running
    assert.equal(result.progress.totalCount, 2)
    assert.equal(result.upGoodsList.length, 2)
    assert.equal(saves, 3)
    assertReleased(f.calls)
  } finally { gates.forEach(gate => gate.resolve()); await f.collection.cancel(); await running.catch(() => undefined) }
})

test('a failed concurrent detail cancels its peers and never launches the rest of the batch', async () => {
  const entered = Promise.withResolvers<void>(), failure = Promise.withResolvers<void>()
  const started: number[] = []
  let aborted = false
  const running = mapConcurrent([0, 1, 2, 3], 2, async (id, _index, signal) => {
    started.push(id)
    if (started.length === 2) entered.resolve()
    if (id === 0) return failure.promise
    signal.addEventListener('abort', () => { aborted = true }, { once: true })
    return new Promise<void>(() => {})
  })
  const rejected = assert.rejects(running, /detail failed/)
  await entered.promise
  failure.reject(new Error('detail failed'))
  await rejected
  assert.equal(aborted, true)
  assert.deepEqual(started, [0, 1])
})

test('reaching the category target aborts outstanding detail requests and completes without waiting for them', async () => {
  const f = fixture({ isUseCategorySelect: 0, targetCount: 1 })
  const entered = Promise.withResolvers<void>()
  const started: string[] = []
  let aborted = 0
  f.deps.request = async config => config.url?.includes('getReMaiData')
    ? { data: { list: ['1', '2', '3', '4'].map(_id => ({ _id })), total: 4 } } : {}
  f.services.main.getDataByApi = async (id: string, signal: AbortSignal) => {
    started.push(id)
    if (started.length === 4) entered.resolve()
    if (id === '1') { await entered.promise; return {} }
    signal.addEventListener('abort', () => { aborted++ }, { once: true })
    return new Promise(() => {})
  }
  f.services.parse.ozonDetailParse = async (_response: any, _domain: string, goods: any) => ({ id: goods._id, price: 1 })
  const result = await f.collection.run()
  assert.equal(result.status, 'completed')
  assert.equal(result.upGoodsList.length, 1)
  assert.equal(aborted, 3)
  assert.deepEqual(started, ['1', '2', '3', '4'])
  assertReleased(f.calls)
})

test('expanded shops drain processing and saving before upload', async () => {
  const f = fixture({ expendType: true, expendShopCount: 1, isUseAutoUpGoods: true })
  const result = await f.collection.run()
  assert.equal(result.upGoodsList.length, 2)
  assert.ok(f.calls.indexOf('save:2') < f.calls.indexOf('upload:2'))
  assertReleased(f.calls)
})

test('expanding the next shop overlaps prior shop item processing and still drains everything before upload', { timeout: 2000 }, async () => {
  const f = fixture({ expendType: true, expendShopCount: 40, targetCount: 100, isUseAutoUpGoods: true })
  const release = Promise.withResolvers<void>(), third = Promise.withResolvers<void>()
  const visited = new Set<number>()
  let page = 0
  f.services.main.changeUrl = async () => { page++; f.calls.push(`shop:${page}`) }
  f.services.parse.ozonListParser = async (_html: unknown, _domain: string, signal: AbortSignal, onGoods: GoodsConsumer, onBatch: GoodsBatchObserver) => {
    if (visited.has(page)) return []
    visited.add(page)
    const goods = { id: String(page + 1), cover: String(page + 1), sellers: page === 0 ? { sellers: [
      { link: '/shop/2', rating: { totalScore: 5 } }, { link: '/shop/3', rating: { totalScore: 5 } },
    ] } : undefined }
    return parsedGoods([goods], signal, onGoods, onBatch)
  }
  f.services.source.createWindow = async (_type: string, cover: string) => {
    if (cover === '2') await release.promise
    if (cover === '3') third.resolve()
    return {}
  }
  const running = f.collection.run()
  try {
    await third.promise
    assert.deepEqual(f.calls.filter(call => call.startsWith('shop:')), ['shop:1', 'shop:2'])
    assert.equal(f.calls.includes('save:2'), false)
    release.resolve()
    assert.equal((await running).upGoodsList.length, 3)
    assert.ok(f.calls.indexOf('save:2') < f.calls.indexOf('upload:3'))
    assertReleased(f.calls)
  } finally { release.resolve(); await f.collection.cancel(); await running.catch(() => undefined) }
})

test('startup failure rejects with partial result and releases resources', async () => {
  const f = fixture()
  f.services.main.createCollectionWindow = async () => {
    throw new Error('load failed')
  }
  await assert.rejects(f.collection.run(), (error) => {
    assert.ok(error instanceof CollectionRunError)
    assert.equal(error.result.status, 'failed')
    assert.equal(error.result.error, 'load failed')
    return true
  })
  assertReleased(f.calls)
})

test('quota error fails the run and never adds unsaved goods to the upload result', async () => {
  const f = fixture()
  f.deps.save = async () => ({ code: 403, count: 0 })
  await assert.rejects(f.collection.run(), (error) => {
    assert.ok(error instanceof CollectionRunError)
    assert.equal(error.result.status, 'failed')
    assert.equal(error.result.hasUpLimit, true)
    assert.deepEqual(error.result.upGoodsList, [])
    return true
  })
  assertReleased(f.calls)
})

test('cancellation finishes even if a legacy request never settles; late results cannot save', async () => {
  const f = fixture()
  const gate = Promise.withResolvers<any[]>()
  const entered = Promise.withResolvers<void>()
  f.services.data.getDetailData = () => {
    entered.resolve()
    return gate.promise
  }
  const running = f.collection.run()
  const rejected = assert.rejects(
    running,
    (error) => error instanceof CollectionRunError && error.result.status === 'cancelled',
  )
  await entered.promise
  await f.collection.cancel()
  await rejected
  gate.resolve([{ id: 'late' }])
  await delay(5)
  assert.equal(f.saved.length, 0)
  assertReleased(f.calls)
})

test('closing the main window fails immediately, aborts producer and cleans resources', async () => {
  const f = fixture()
  const entered = Promise.withResolvers<void>()
  f.services.data.getBaseData = () => {
    entered.resolve()
    return new Promise(() => {})
  }
  const running = f.collection.run()
  const rejected = assert.rejects(
    running,
    (error) => error instanceof CollectionRunError && error.result.status === 'failed',
  )
  await entered.promise
  f.collection.closeHandle()
  await rejected
  assertReleased(f.calls)
})

test('cleanup attempts remaining resources even when one destroy throws', async () => {
  const f = fixture()
  f.services.source.destroy = () => {
    f.calls.push('source.destroy')
    throw new Error('destroy failed')
  }
  await assert.rejects(
    f.collection.run(),
    (error) => error instanceof CollectionRunError && error.result.error === 'destroy failed',
  )
  assertReleased(f.calls)
})

test('whole-run deadline recovers a hung producer', async () => {
  const f = fixture()
  f.deps.timing!.run = 30
  f.services.data.getBaseData = () => new Promise(() => {})
  await assert.rejects(
    f.collection.run(),
    (error) => error instanceof CollectionRunError && error.result.error === '采集任务超时',
  )
  assertReleased(f.calls)
})

test('cancellation publishes stopping before asynchronous cleanup and status sync finish', async () => {
  const f = fixture()
  const entered = Promise.withResolvers<void>()
  const sync = Promise.withResolvers<void>()
  const updates: any[] = []
  ;(f.collection as any).mainWindow = {
    isDestroyed: () => false,
    webContents: { send: (event: string, payload: any) => updates.push({ event, payload }) },
  }
  f.services.data.getBaseData = () => {
    entered.resolve()
    return new Promise(() => {})
  }
  f.deps.request = async (config) => {
    if (config.data.taskStatus === 'cancelled') await sync.promise
    return { data: {} }
  }
  const running = f.collection.run()
  const rejected = assert.rejects(running, CollectionRunError)
  await entered.promise
  const cancelling = f.collection.cancel()
  assert.equal(f.collection.getTaskInfo().phase, 'stopping')
  assert.ok(
    updates.some(
      (update) => update.event === 'task-status-update' && update.payload.task.phase === 'stopping',
    ),
  )
  assert.equal(f.calls.includes('source.destroy'), false)
  sync.resolve()
  await cancelling
  await rejected
  assert.equal(f.collection.getTaskInfo().phase, 'cancelled')
})

test('scope timeout aborts the underlying operation', async () => {
  const scope = new TaskScope()
  let aborted = false
  await assert.rejects(
    scope.run(
      (signal) =>
        new Promise(() => {
          signal.addEventListener(
            'abort',
            () => {
              aborted = true
            },
            { once: true },
          )
        }),
      10,
      'request',
    ),
    TaskTimeoutError,
  )
  assert.equal(aborted, true)
  scope.stop()
})

test('scope cancellation tears down timers and rejects future operations', async () => {
  const scope = new TaskScope()
  const waiting = assert.rejects(scope.sleep(60_000), TaskCancelledError)
  scope.stop()
  await waiting
  await assert.rejects(
    scope.run(() => 1),
    TaskCancelledError,
  )
})

test('unlimited total duration still responds to cancellation', async () => {
  const scope = new TaskScope()
  const waiting = assert.rejects(
    scope.run(() => new Promise(() => {}), 0),
    TaskCancelledError,
  )
  await delay(5)
  scope.stop()
  await waiting
})

test('reaching the target releases a paused producer and aborts other item windows before they can persist', async () => {
  const f = fixture({ targetCount: 1 })
  const paused = Promise.withResolvers<void>()
  let scrolls = 0
  f.deps.log.info = (label: string) => { if (label === '采集背压等待:') paused.resolve() }
  f.services.main.scrollPage = async () => { scrolls++; return false }
  let parsed = false
  f.services.parse.ozonListParser = async (_html: unknown, _domain: string, signal: AbortSignal, onGoods?: GoodsConsumer, onBatch?: GoodsBatchObserver) => {
    if (parsed) return []
    parsed = true
    return parsedGoods(['one', 'two', 'three', ...Array.from({ length: 27 }, (_, i) => String(i + 4))].map((id) => ({ id, cover: id })), signal, onGoods, onBatch)
  }
  let aborted = 0
  let started = 0
  const entered = Promise.withResolvers<void>()
  f.services.source.createWindow = async (_type: string, cover: string, signal: AbortSignal) => {
    if (++started === 3) entered.resolve()
    if (cover === 'one') { await Promise.all([entered.promise, paused.promise]); return { link1688: 'source', sourcePrice: 1 } }
    await new Promise<void>((resolve) =>
      signal.addEventListener(
        'abort',
        () => {
          aborted++
          resolve()
        },
        { once: true },
      ),
    )
    signal.throwIfAborted()
  }
  const result = await f.collection.run()
  assert.equal(result.upGoodsList.length, 1)
  assert.equal(f.saved.length, 1)
  assert.equal(aborted, started - 1)
  assert.ok(started >= 3 && started <= 4)
  assert.equal(scrolls, 0)
  assertReleased(f.calls)
})

test('queue enforces concurrency, releases timed-out slots and keeps only counters', async () => {
  let active = 0
  let peak = 0
  let errors = 0
  const queue = new TaskQueueService<{ id: string }>(
    async (_, signal) => {
      active++
      peak = Math.max(peak, active)
      await new Promise<void>((resolve) =>
        signal.addEventListener(
          'abort',
          () => {
            active--
            resolve()
          },
          { once: true },
        ),
      )
    },
    2,
    {
      timeoutMs: 10,
      onError: () => {
        errors++
      },
    },
  )
  queue.addTask(['1', '2', '3', '4'].map((id) => ({ id })))
  await queue.whenIdle()
  assert.equal(peak, 2)
  assert.equal(active, 0)
  assert.equal(errors, 4)
  assert.equal(queue.getFailedTasksCount(), 4)
  queue.destroy()
  await queue.whenIdle()
})

test('destroy drops buffered tasks and aborts active workers', async () => {
  let started = 0
  const entered = Promise.withResolvers<void>()
  const queue = new TaskQueueService<{ id: string }>(async (_, signal) => {
    started++
    entered.resolve()
    await new Promise((resolve) => signal.addEventListener('abort', resolve, { once: true }))
  }, 1)
  queue.addTask([{ id: '1' }, { id: '2' }])
  await entered.promise
  const drained = queue.whenIdle()
  queue.destroy()
  await drained
  await delay(5)
  assert.equal(started, 1)
  assert.equal(queue.getActiveCount(), 0)
  assert.equal(queue.getTaskCount(), 0)
})
