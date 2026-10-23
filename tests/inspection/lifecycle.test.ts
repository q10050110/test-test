import { test } from 'node:test'
import assert from 'node:assert/strict'
import { InspectionServices, InspectionRunError, type InspectionDependencies } from '../../electron/services/inspection/index.services.js'
import type { Inspection } from '../../electron/services/inspection/type.js'

function fixture() {
  const calls: string[] = [], events: any[] = []
  let pages = 0, onClosed = () => {}
  const goods = { id: '1', price: 100, sellerNumber: 1, followList: Array.from({ length: 1001 }, (_, n) => ({ sku: String(n) })) }
  const main = { createCollectionWindow: async () => {}, getHTML: async () => ({ html: '', domain: '' }), scrollPage: async () => false, destroy: () => { calls.push('main.destroy') } }
  const parse = { ozonListParser: async () => ++pages === 1 ? [goods] : [], destroy: () => { calls.push('parse.destroy') } }
  const deps: InspectionDependencies = {
    createServices: closed => { onClosed = closed; calls.push('create'); return { main, parse } },
    updateStatus: async ({ status }) => { calls.push(status); return { code: 0, data: {}, message: '' } },
    saveBatch: async () => { calls.push('batch'); return { code: 0, data: [{ sku: '1', dataId: 'record' }], message: '' } },
    saveSellers: async ({ items }) => { calls.push('sellers:' + items.length); return { code: 0, data: {}, message: '' } },
    log: { info() {}, warn() {}, error() {} }, metrics() {}, timing: { scroll: 0, status: 20, operation: 50 },
  }
  const task = new InspectionServices({ _id: 'task', shopName: 'test', shopUrl: 'test', status: 'noExecuted' } as Inspection,
    { isDestroyed: () => false, webContents: { send: (_channel: string, data: any) => events.push(data) } } as any, deps)
  return { task, calls, deps, main, parse, events, close: () => onClosed() }
}
test('success waits for all seller batches, commits progress, and cleans each resource once', async () => {
  const f = fixture(), first = f.task.start()
  assert.equal(f.task.start(), first)
  const result = await first
  assert.equal(result.status, 'completed')
  assert.equal(result.inspectedCount, 1)
  assert.equal(result.followedCount, 1)
  assert.deepEqual(f.calls.filter(x => x.startsWith('sellers:')), ['sellers:500', 'sellers:500', 'sellers:1'])
  assert.ok(f.events.filter(event => event.log.taskLog.includes('已保存')).every(event => event.inspectionTask.inspectedCount === 1))
  await f.task.stopTask()
  assert.equal(f.calls.filter(x => x === 'main.destroy').length, 1)
  assert.equal(f.calls.filter(x => x === 'parse.destroy').length, 1)
})
test('seller save failure reports failed without counting an incomplete batch', async () => {
  const f = fixture()
  f.deps.saveSellers = async () => { throw new Error('save failed') }
  await assert.rejects(f.task.start(), (error: any) => error instanceof InspectionRunError && error.result.inspectedCount === 0 && error.result.status === 'failed')
  assert.ok(f.calls.includes('parse.destroy'))
})
test('cancelling a hung producer returns after cleanup and late results cannot save', async () => {
  const f = fixture(), entered = Promise.withResolvers<void>(), late = Promise.withResolvers<any[]>()
  f.parse.ozonListParser = async () => { entered.resolve(); return late.promise }
  const started = f.task.start(), rejected = assert.rejects(started, InspectionRunError)
  await entered.promise
  const stopped = f.task.stopTask()
  assert.equal(f.task.getTaskInfo().phase, 'stopping')
  await stopped; await rejected
  late.resolve([{ id: 'late' }])
  await new Promise(setImmediate)
  assert.equal(f.calls.includes('batch'), false)
  assert.equal(f.task.getTaskInfo().status, 'cancelled')
})
test('cancelling during a late save aborts the HTTP signal and prevents seller writes', async () => {
  const f = fixture(), entered = Promise.withResolvers<void>(), late = Promise.withResolvers<any>()
  let signal: AbortSignal | undefined
  f.deps.saveBatch = async (_data, requestSignal) => { signal = requestSignal; entered.resolve(); return late.promise }
  const started = f.task.start(), rejected = assert.rejects(started, InspectionRunError)
  await entered.promise
  await f.task.stopTask(); await rejected
  assert.equal(signal?.aborted, true)
  late.resolve({ code: 0, data: [{ sku: '1', dataId: 'r' }] })
  await new Promise(setImmediate)
  assert.equal(f.calls.some(x => x.startsWith('sellers:')), false)
  assert.equal(f.task.getTaskInfo().inspectedCount, 0)
})
test('window failure and total deadline both release main and parser resources', async () => {
  for (const timeout of [false, true]) {
    const f = fixture(), entered = Promise.withResolvers<void>()
    f.parse.ozonListParser = async () => { entered.resolve(); return new Promise(() => {}) }
    if (timeout) f.deps.timing!.run = 10
    const started = f.task.start(), rejected = assert.rejects(started, InspectionRunError)
    await entered.promise
    if (!timeout) f.close()
    await rejected
    assert.equal(f.task.getTaskInfo().status, 'failed')
    assert.ok(f.calls.includes('main.destroy') && f.calls.includes('parse.destroy'))
  }
})
test('a failing window cleanup still releases parser and makes completion fail', async () => {
  const f = fixture()
  f.main.destroy = () => { throw new Error('destroy failed') }
  await assert.rejects(f.task.start(), InspectionRunError)
  assert.ok(f.calls.includes('parse.destroy'))
})
test('pending cancellation is idempotent and never allocates browser services', async () => {
  const f = fixture()
  f.task.markPending()
  await Promise.all([f.task.stopTask(), f.task.stopTask()])
  assert.equal(f.calls.includes('create'), false)
  assert.equal(f.task.getTaskInfo().status, 'cancelled')
  await assert.rejects(f.task.start(), /释放/)
})
test('unresponsive status synchronization is bounded and cannot retain task resources', async () => {
  const f = fixture()
  f.deps.updateStatus = async () => new Promise(() => {})
  f.deps.timing!.status = 5
  assert.equal((await f.task.start()).status, 'completed')
  assert.ok(f.calls.includes('parse.destroy'))
})
