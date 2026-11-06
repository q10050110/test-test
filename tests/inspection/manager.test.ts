import { test } from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import type { Inspection } from '../../electron/services/inspection/type.js'

const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (context.parentURL?.endsWith('/inspection/task-manager.services.ts') || context.parentURL?.endsWith('/inspection/task-manager.services.js')) {
      if (specifier === './api.services.js' || specifier === './inspection-runtime.services.js' || (specifier === '../../log/index.js' || specifier === '../../log/business.js')) return { url: 'test:manager:' + specifier, shortCircuit: true }
    }
    return next(specifier, context)
  },
  load(url, context, next) {
    if (url === 'test:manager:./api.services.js') return { format: 'module', shortCircuit: true, source: 'export {};' }
    if (url === 'test:manager:./inspection-runtime.services.js') return { format: 'module', shortCircuit: true, source: 'export const inspectionDependencies = {};' }
    if ((url === 'test:manager:../../log/index.js' || url === 'test:manager:../../log/business.js')) return { format: 'module', shortCircuit: true, source: 'export default { info() {}, warn() {}, error() {} };' }
    return next(url, context)
  },
})
const { TaskManager } = await import('../../electron/services/inspection/task-manager.services.js')
hooks.deregister()
const tick = () => new Promise(setImmediate)
const taskInfo = (id: string): Inspection => ({ _id: id, status: 'noExecuted', shopName: id, shopUrl: 'test', executionMethod: 'MANUAL', autoExecutionTime: '', inspectedCount: 0, followedCount: 0 } as Inspection)
class FakeTask {
  started = 0
  readonly done = Promise.withResolvers<void>()
  stopGate: Promise<void> = Promise.resolve()
  constructor(readonly info: Inspection) {}
  markPending() { this.info.status = 'pending' }
  getTaskInfo() { return { ...this.info, phase: ['completed', 'failed', 'cancelled'].includes(this.info.status) ? this.info.status : 'idle' } }
  async start() {
    if (this.info.status === 'cancelled') throw new Error('disposed')
    this.started++; this.info.status = 'running'
    await this.done.promise
  }
  async stopTask() {
    if (['completed', 'failed', 'cancelled'].includes(this.info.status)) return
    this.info.status = 'cancelled'
    await this.stopGate
    this.done.resolve()
  }
  finish() { this.info.status = 'completed'; this.done.resolve() }
}
function fixture() {
  const created: FakeTask[] = [], deleted: string[] = [], scheduled: any[] = [], synced: any[] = []
  let list: Inspection[] = []
  const api = {
    getTaskListAPI: async () => ({ code: 0, data: { list: list.map(x => ({ ...x })), total: list.length }, message: '' }),
    updateTaskStatusAPI: async (data: any) => { synced.push(data); return { code: 0, data: {}, message: '' } },
    createTaskAPI: async (data: Inspection) => ({ code: 0, data, message: '' }),
    updateTaskAPI: async (data: any) => ({ code: 0, data: { ...data, _id: data.taskId }, message: '' }),
    deleteTaskAPI: async () => ({ code: 0, data: 'ok', message: '' }),
    getTimerTaskListAPI: async () => ({ code: 0, data: list, message: '' }),
  }
  const manager = new TaskManager({ api, createTask: info => { const task = new FakeTask(info); created.push(task); return task }, cron: { register: data => scheduled.push(data), delete: id => deleted.push(id) } } as any)
  return { manager, created, api, deleted, scheduled, synced, list: (data: Inspection[]) => { list = data } }
}
test('duplicate starts reserve once and saturated tasks queue instead of disappearing', async () => {
  const f = fixture()
  f.manager.setConcurrency(1)
  const results = await Promise.all([f.manager.executeTask(taskInfo('a')), f.manager.executeTask(taskInfo('a')), f.manager.executeTask(taskInfo('b'))])
  assert.deepEqual(results, [true, false, true])
  assert.equal(f.created[0].started, 1)
  assert.equal(f.created[1].started, 0)
  f.created[0].info.status = 'completed'
  assert.equal(f.manager.getTask('a')?.phase, 'cleaning')
  await tick()
  assert.equal(f.created[1].started, 0)
  f.created[0].done.resolve()
  await tick()
  assert.equal(f.created[1].started, 1)
  f.created[1].finish()
  await tick()
  assert.equal((await f.manager.getRunningTaskList()).data.length, 0)
})
test('pending cancellation never starts the task and missing local tasks use only the status API', async () => {
  const f = fixture()
  f.manager.setConcurrency(1)
  await f.manager.executeTask(taskInfo('a')); await f.manager.executeTask(taskInfo('b'))
  const info = await f.manager.stopTask(taskInfo('b'))
  assert.equal(info.status, 'cancelled')
  assert.equal(f.created[1].started, 0)
  await f.manager.stopTask(taskInfo('external'))
  assert.equal(f.created.length, 2)
  assert.equal(f.synced[0].taskId, 'external')
  f.created[0].finish(); await tick()
})
test('stopAll is shared, blocks new work, waits for cleanup, and never starts buffered tasks', async () => {
  const f = fixture(), cleanup = Promise.withResolvers<void>()
  f.manager.setConcurrency(1)
  await f.manager.executeTask(taskInfo('a')); await f.manager.executeTask(taskInfo('b'))
  f.created[0].stopGate = cleanup.promise
  const first = f.manager.stopAllTasks()
  assert.equal(f.manager.stopAllTasks(), first)
  await assert.rejects(f.manager.executeTask(taskInfo('new')), /停止/)
  assert.equal(f.created[1].started, 0)
  cleanup.resolve()
  await first
  assert.equal((await f.manager.getRunningTaskList()).data.length, 0)
})
test('running and recently completed snapshots override delayed server list status', async () => {
  const f = fixture()
  f.list([taskInfo('a')])
  await f.manager.executeTask(taskInfo('a'))
  assert.equal((await f.manager.getTaskList({ pageNo: 1, pageSize: 10 })).data.list[0].status, 'running')
  f.created[0].finish(); await tick()
  assert.equal((await f.manager.getTaskList({ pageNo: 1, pageSize: 10 })).data.list[0].status, 'completed')
})
test('deleting multiple tasks removes every associated cron registration', async () => {
  const f = fixture()
  for (const id of ['a', 'b']) await f.manager.createTask({ ...taskInfo(id), executionMethod: 'AUTO', autoExecutionTime: '09:30' } as any)
  assert.equal(f.scheduled.length, 2)
  assert.equal(f.scheduled[0].expression, '30 9 * * *')
  await f.manager.deleteTask({ taskIds: ['a', 'b'] })
  assert.deepEqual(f.deleted, ['a', 'b'])
})
test('start rejection and dead UI cannot retain slots or prevent the next task', async () => {
  const f = fixture()
  f.manager.setMainWindow({ isDestroyed: () => false, webContents: { send() { throw new Error('dead renderer') } } } as any)
  f.manager.setConcurrency(1)
  await f.manager.executeTask(taskInfo('a'))
  await f.manager.executeTask(taskInfo('b'))
  f.created[0].done.reject(new Error('run failed'))
  await tick()
  assert.equal(f.created[1].started, 1)
  await f.manager.stopAllTasks()
})

test('shutdown invalidates a delayed cron restore and callbacks from the previous login', async () => {
  const f = fixture(), gate = Promise.withResolvers<any>()
  const automatic = { ...taskInfo('old'), executionMethod: 'AUTO', autoExecutionTime: '09:00' } as Inspection
  await f.manager.createTask(automatic as any)
  const oldCallback = f.scheduled[0].handler
  f.api.getTimerTaskListAPI = async () => gate.promise
  const restoring = f.manager.restoreScheduledTasks()
  await f.manager.stopAllTasks()
  gate.resolve({ code: 0, data: [automatic], message: '' })
  await restoring
  await oldCallback()
  assert.equal(f.scheduled.length, 1)
  assert.equal(f.created.length, 0)
})
