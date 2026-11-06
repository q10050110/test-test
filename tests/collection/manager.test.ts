import { test } from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import type { CollectionResult, Task } from '../../electron/services/collection/type.js'

class FakeRunError extends Error {
  constructor(readonly result: CollectionResult) {
    super('failed')
  }
}
class FakeCollection {
  readonly gate = Promise.withResolvers<CollectionResult>()
  started = 0
  cleared = 0
  cancelled = 0
  constructor(readonly info: any) {}
  run() {
    this.started++
    this.info.taskStatus = 'running'
    return this.gate.promise
  }
  getTaskInfo() {
    return this.info
  }
  getPhase() {
    return 'idle'
  }
  outputLog() {}
  updateStatus(status: string) {
    this.info.taskStatus = status
    return Promise.resolve()
  }
  clearStatus() {
    this.cleared++
    return Promise.resolve()
  }
  async cancel() {
    this.cancelled++
    this.info.taskStatus = 'cancelled'
    if (this.started) this.gate.reject(new FakeRunError(this.result('cancelled')))
    else await this.clearStatus()
  }
  complete() {
    this.info.taskStatus = 'completed'
    this.gate.resolve(this.result('completed'))
  }
  result(status: any): CollectionResult {
    return {
      status,
      filePath: '',
      hasUpLimit: false,
      progress: { current: 0, total: 1, totalCount: 1 },
      upGoodsList: [{ id: 'goods' }],
    }
  }
}
let save: (id: string, result: CollectionResult) => Promise<any> = async (
  _id,
  { upGoodsList, ...meta },
) => meta
let request: (config: any) => Promise<any> = async () => ({ data: {} })
class FakeResultStore {
  save(id: string, result: CollectionResult) {
    return save(id, result)
  }
  async summary() {
    return undefined
  }
  async remove() {}
}
;(globalThis as any).__managerMocks = {
  Collection: FakeCollection,
  CollectionRunError: FakeRunError,
  CollectionResultStore: FakeResultStore,
  request: (config: any) => request(config),
}
const hook = registerHooks({
  resolve(specifier, context, next) {
    const mocks: Record<string, string> = {
      './collection.services.js': 'collection',
      './collection-runtime.services.js': 'runtime',
      './collection-result-store.services.js': 'store',
      '../../utils/request.js': 'request',
      '../../log/index.js': 'log',
      '../../utils/system.js': 'system',
      '../../store/index.js': 'account',
      '../memory-monitor.services.js': 'memory',
      './interface.services.js': 'api',
    }
    if (mocks[specifier]) return { url: 'manager-test:' + mocks[specifier], shortCircuit: true }
    return next(specifier, context)
  },
  load(url, context, next) {
    const sources: Record<string, string> = {
      collection: 'export const { Collection, CollectionRunError } = globalThis.__managerMocks;',
      runtime: 'export const collectionDependencies = {};',
      store: 'export const { CollectionResultStore } = globalThis.__managerMocks;',
      request: 'export default globalThis.__managerMocks.request;',
      log: 'export default { info() {}, warn() {}, error() {} };',
      system:
        'export const SysTemUtils = { getAppInfo: () => ({userDataPath: process.cwd()}), fileOperations: { exists: () => false } };',
      account: 'export const operationStore = { get: () => ({_id: "test-account"}) };',
      memory: 'export const memoryMonitor = {};',
      api: 'export const autoUpGoods = async () => "success"; export const autoSaveData = async () => {};',
    }
    const source = sources[url.replace('manager-test:', '')]
    return source ? { format: 'module', shortCircuit: true, source } : next(url, context)
  },
})
const { TaskManager } = await import('../../electron/services/collection/task-manager.services.js')
hook.deregister()
function setup(concurrency = 1) {
  save = async (_id, { upGoodsList, ...meta }) => meta
  request = async () => ({ data: {} })
  const manager: any = Reflect.construct(TaskManager, [])
  manager.setMaxConcurrentTasks(concurrency)
  const add = (id: string) => {
    const task = new FakeCollection({ _id: id, taskStatus: 'noExecuted', taskName: id })
    manager.tasks.set(id, task)
    return task
  }
  return { manager, add }
}

test('manager starts four tasks together and queues the fifth until a slot is released', async () => {
  const { manager, add } = setup(4)
  const ids = ['a', 'b', 'c', 'd', 'e']
  const tasks = ids.map(add)
  try {
    await Promise.all(ids.map(id => manager.startTaskById(id)))
    assert.deepEqual(tasks.map(task => task.started), [1, 1, 1, 1, 0])
    assert.equal(manager.activeTasks.size, 4)
    const finished = manager.executions.get('a')
    tasks[0]!.complete()
    await finished
    assert.equal(tasks[4]!.started, 1)
    assert.equal(manager.activeTasks.size, 4)
  } finally { await manager.stopAllTasks() }
})

test('manager retains concurrency slot until result persistence and cleanup finish', async () => {
  const { manager, add } = setup()
  const a = add('a'),
    b = add('b')
  const entered = Promise.withResolvers<void>()
  const disk = Promise.withResolvers<void>()
  save = async (_id, { upGoodsList, ...meta }) => {
    entered.resolve()
    await disk.promise
    return meta
  }
  await manager.startTaskById('a')
  await manager.startTaskById('b')
  const aFinished = manager.executions.get('a')
  a.complete()
  await entered.promise
  manager.refreshTaskQueue()
  assert.equal(b.started, 0)
  assert.equal(manager.activeTasks.size, 1)
  disk.resolve()
  await aFinished
  assert.equal(a.cleared, 1)
  assert.equal(b.started, 1)
  assert.equal('upGoodsList' in manager.filePathList.get('a'), false)
  const bFinished = manager.executions.get('b')
  b.complete()
  await bFinished
  assert.equal(manager.tasks.size, 0)
  assert.equal(manager.activeTasks.size, 0)
  assert.equal(manager.executions.size, 0)
})

test('result persistence failure cannot prevent task removal or the next queued task', async () => {
  const { manager, add } = setup()
  const a = add('a'),
    b = add('b')
  save = async () => {
    throw new Error('disk full')
  }
  await manager.startTaskById('a')
  await manager.startTaskById('b')
  const finished = manager.executions.get('a')
  a.complete()
  await finished
  assert.equal(manager.tasks.has('a'), false)
  assert.equal(a.cleared, 1)
  assert.equal(b.started, 1)
  const bFinished = manager.executions.get('b')
  b.complete()
  await bFinished
})

test('stopAll shares one completion promise and cancels pending tasks without starting them', async () => {
  const { manager, add } = setup()
  const a = add('a'),
    b = add('b')
  await manager.startTaskById('a')
  await manager.startTaskById('b')
  const first = manager.stopAllTasks()
  assert.equal(first, manager.stopAllTasks())
  await first
  assert.equal(a.cancelled, 1)
  assert.equal(b.cancelled, 1)
  assert.equal(b.started, 0)
  assert.equal(manager.tasks.size, 0)
  assert.equal(manager.activeTasks.size, 0)
  assert.equal(manager.executions.size, 0)
})

test('cancel pending task releases its actor and removes registry entry', async () => {
  const { manager, add } = setup()
  const pending = add('pending')
  await manager.cancelTask('pending')
  assert.equal(pending.cleared, 1)
  assert.equal(manager.tasks.has('pending'), false)
})

test('restart can load a completed task from server after prior instance was removed', async () => {
  const { manager } = setup()
  request = async () => ({ data: { _id: 'old', taskName: 'old', taskStatus: 'completed' } as Task })
  await manager.reExecuteTask('old')
  const task = manager.tasks.get('old') as FakeCollection
  assert.equal(task.started, 1)
  const finished = manager.executions.get('old')
  task.complete()
  await finished
})

test('destroyed renderer cannot strand active task bookkeeping', async () => {
  const { manager, add } = setup()
  manager.setMainWindow({
    isDestroyed: () => false,
    webContents: {
      send() {
        throw new Error('renderer closed')
      },
    },
  })
  const task = add('a')
  await manager.startTaskById('a')
  const finished = manager.executions.get('a')
  task.complete()
  await finished
  assert.equal(manager.tasks.size, 0)
  assert.equal(manager.activeTasks.size, 0)
  assert.equal(manager.executions.size, 0)
})

test('task list preserves stopping while remote status and result persistence lag behind', async () => {
  const { manager, add } = setup()
  const task = add('a')
  const entered = Promise.withResolvers<void>()
  const disk = Promise.withResolvers<void>()
  save = async (_id, { upGoodsList, ...summary }) => {
    entered.resolve()
    await disk.promise
    return summary
  }
  request = async () => ({ data: { list: [{ _id: 'a', taskStatus: 'running' }], total: 1 } })
  await manager.startTaskById('a')
  const cancelling = manager.cancelTask('a')
  await entered.promise
  assert.equal(manager.getTask('a').phase, 'stopping')
  assert.equal((await manager.getAllTasks({ pageNo: 1, pageSize: 10 })).list[0].phase, 'stopping')
  disk.resolve()
  const ended = await cancelling
  assert.equal(ended.taskStatus, 'cancelled')
  const refreshed = await manager.getAllTasks({ pageNo: 1, pageSize: 10 })
  assert.equal(refreshed.list[0].taskStatus, 'cancelled')
  assert.equal(refreshed.list[0].phase, 'cancelled')
  assert.equal(task.cancelled, 1)
})
