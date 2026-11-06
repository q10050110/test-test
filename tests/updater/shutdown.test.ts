import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { registerHooks } from 'node:module'

test('普通退出保留 quit 生命周期，更新安装前完成清理并放行退出', async (t) => {
  const app = new EventEmitter() as EventEmitter & Record<string, any>
  const order: string[] = []
  const updater = {
    isInstalling: false,
    prepare: async () => {},
    setBeforeInstall(callback: () => Promise<void>) {
      this.prepare = callback
    },
  }
  let releaseCleanup!: () => void
  const cleanup = new Promise<void>((resolve) => {
    releaseCleanup = resolve
  })
  app.commandLine = { appendSwitch() {} }
  app.requestSingleInstanceLock = () => true
  app.whenReady = () => new Promise(() => {})
  app.exit = () => order.push('exit')
  app.quit = () => {
    order.push('quit')
    app.emit('before-quit', { preventDefault: () => order.push('blocked') })
  }
  const logger = { info() {}, warn() {}, error() {} }
  const windows = [{ destroy: () => order.push('destroy') }]
  ;(globalThis as any).__shutdownTest = {
    app,
    windows,
    logger,
    updater,
    close: async () => {
      order.push('stop')
      await cleanup
      order.push('stopped')
    },
  }
  const sources: Record<string, string> = {
    electron: `export const app = globalThis.__shutdownTest.app;
      export const BrowserWindow = { getAllWindows: () => globalThis.__shutdownTest.windows }`,
    './windows/main.window.js': 'export function createWindow() {}',
    './log/index.js':
      'export default globalThis.__shutdownTest.logger; export function initLogger() {}',
    './services/closeProcess.services.js': `export class CloseProcessService {
      async deleteFolder() {} async run() { await globalThis.__shutdownTest.close() }
    }`,
    './ipc/broadcast.js': 'export const globalBroadcast = { broadcast() {} }',
    './store/index.js': 'export const operationStore = {}',
    './services/common/memory-monitor.services.js': 'export const memoryMonitor = { stop() {} }',
    './services/startProcess.services.js': 'export class StartProcessService {}',
    './services/update.services.js':
      'export const UpdaterManager = { getInstance: () => globalThis.__shutdownTest.updater }',
  }
  const exceptions = process.listeners('uncaughtException')
  const rejections = process.listeners('unhandledRejection')
  const hook = registerHooks({
    resolve(specifier, context, next) {
      if (sources[specifier]) return { url: `shutdown-test:${specifier}`, shortCircuit: true }
      return next(specifier, context)
    },
    load(url, context, next) {
      if (url.startsWith('shutdown-test:'))
        return { format: 'module', source: sources[url.slice(14)], shortCircuit: true }
      return next(url, context)
    },
  })
  t.after(() => {
    hook.deregister()
    for (const listener of process.listeners('uncaughtException')) {
      if (!exceptions.includes(listener)) process.removeListener('uncaughtException', listener)
    }
    for (const listener of process.listeners('unhandledRejection')) {
      if (!rejections.includes(listener)) process.removeListener('unhandledRejection', listener)
    }
    delete (globalThis as any).__shutdownTest
  })
  await import('../../electron/main.js')

  app.emit('before-quit', { preventDefault: () => order.push('blocked') })
  assert.deepEqual(order, ['blocked'])
  // deleteFolder 是异步方法，等待 run 开始。
  await new Promise((resolve) => setImmediate(resolve))
  assert.deepEqual(order, ['blocked', 'stop'])
  releaseCleanup()
  await new Promise((resolve) => setImmediate(resolve))
  assert.deepEqual(order, ['blocked', 'stop', 'stopped', 'destroy', 'quit'])
  assert.equal(order.includes('exit'), false)

  order.length = 0
  updater.isInstalling = true
  await updater.prepare()
  app.emit('before-quit', { preventDefault: () => order.push('blocked') })
  assert.deepEqual(order, ['stop', 'stopped'])
})
