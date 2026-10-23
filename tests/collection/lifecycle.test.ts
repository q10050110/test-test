import { test } from 'node:test'
import assert from 'node:assert/strict'
import { setTimeout as delay } from 'node:timers/promises'
import {
  Collection,
  CollectionRunError,
  type CollectionDependencies,
} from '../../electron/services/collection/collection.services.js'
import { createCollectionActor } from '../../electron/services/collection/collection-machine.js'
import {
  TaskScope,
  TaskCancelledError,
  TaskTimeoutError,
} from '../../electron/services/collection/task-scope.js'
import { TaskQueueService } from '../../electron/services/collection/task-queue.services.js'
import type { Task } from '../../electron/services/collection/type.js'

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
      ozonListParser: async () => {
        if (visited.has(stage)) return []
        visited.add(stage)
        return stage ? [second] : [first]
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

test('expanded shops drain processing and saving before upload', async () => {
  const f = fixture({ expendType: true, expendShopCount: 1, isUseAutoUpGoods: true })
  const result = await f.collection.run()
  assert.equal(result.upGoodsList.length, 2)
  assert.ok(f.calls.indexOf('save:2') < f.calls.indexOf('upload:2'))
  assertReleased(f.calls)
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

test('reaching the target aborts other item windows before they can persist', async () => {
  const f = fixture({ targetCount: 1 })
  let parsed = false
  f.services.parse.ozonListParser = async () => {
    if (parsed) return []
    parsed = true
    return ['one', 'two', 'three'].map((id) => ({ id, cover: id }))
  }
  let aborted = 0
  f.services.source.createWindow = async (_type: string, cover: string, signal: AbortSignal) => {
    if (cover === 'one') return { link1688: 'source', sourcePrice: 1 }
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
  assert.equal(aborted, 2)
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
