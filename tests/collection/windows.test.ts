import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter, getEventListeners } from 'node:events'
import { registerHooks } from 'node:module'

class FakeContents extends EventEmitter {
  destroyed = false
  stopped = false
  isDestroyed() {
    return this.destroyed
  }
  stop() {
    this.stopped = true
  }
  executeJavaScript() {
    return Promise.resolve('')
  }
}
class FakeWindow extends EventEmitter {
  static instances: FakeWindow[] = []
  readonly contents = new FakeContents()
  destroyed = false
  constructor(readonly options: any) {
    super()
    FakeWindow.instances.push(this)
  }
  get webContents() {
    if (this.destroyed) throw new Error('Object has been destroyed')
    return this.contents
  }
  isDestroyed() {
    return this.destroyed
  }
  loadURL() {
    return Promise.resolve()
  }
  destroy() {
    this.destroyed = true
    this.contents.destroyed = true
    this.emit('closed')
  }
}
const ipc = new EventEmitter()
;(globalThis as any).__collectionElectron = { BrowserWindow: FakeWindow, ipcMain: ipc }
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'electron') return { url: 'test:electron', shortCircuit: true }
    if (specifier === '../../log/index.js') return { url: 'test:log', shortCircuit: true }
    return next(specifier, context)
  },
  load(url, context, next) {
    if (url === 'test:electron')
      return {
        format: 'module',
        shortCircuit: true,
        source: 'export const { BrowserWindow, ipcMain } = globalThis.__collectionElectron;',
      }
    if (url === 'test:log')
      return {
        format: 'module',
        shortCircuit: true,
        source: 'export default { info() {}, warn() {}, error() {} };',
      }
    return next(url, context)
  },
})
const { MainWindowService } =
  await import('../../electron/services/collection/main-window.services.js')
const { WindowService } = await import('../../electron/services/collection/1688-window.services.js')
hooks.deregister()

test('aborting main-window creation rejects and removes loading listeners and abort listener', async () => {
  let abnormal = 0
  const main = new MainWindowService(() => {
    abnormal++
  })
  const controller = new AbortController()
  const created = main.createCollectionWindow('https://test', controller.signal)
  const rejected = assert.rejects(created, /cancel/)
  const win = FakeWindow.instances.at(-1)!
  controller.abort(new Error('cancel'))
  await rejected
  assert.equal(win.destroyed, true)
  assert.equal(win.contents.listenerCount('dom-ready'), 0)
  assert.equal(win.contents.listenerCount('did-fail-load'), 0)
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0)
  assert.equal(abnormal, 0)
})

test('main-frame load failure closes window and removes pending handlers', async () => {
  const main = new MainWindowService(() => {})
  const created = main.createCollectionWindow('https://test')
  const rejected = assert.rejects(created, /load failed/)
  const win = FakeWindow.instances.at(-1)!
  win.contents.emit('did-fail-load', {}, -105, 'load failed', 'https://test', true)
  await rejected
  assert.equal(win.destroyed, true)
  assert.equal(win.contents.listenerCount('did-fail-load'), 0)
})

test('cancelling an image-search window releases IPC, abort listener and browser', async () => {
  const source = new WindowService({} as any)
  const controller = new AbortController()
  const created = source.createWindow('1', 'cover', controller.signal)
  const rejected = assert.rejects(created, /cancel/)
  await new Promise(setImmediate)
  const win = FakeWindow.instances.at(-1)!
  const id = win.options.webPreferences.additionalArguments[0].slice('--winId='.length)
  assert.equal(ipc.listenerCount('result-page-' + id), 1)
  controller.abort(new Error('cancel'))
  await rejected
  assert.equal(win.destroyed, true)
  assert.equal(ipc.listenerCount('result-page-' + id), 0)
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0)
  source.destroy()
})

test('unexpected image-search window close rejects without accessing destroyed webContents', async () => {
  const source = new WindowService({} as any)
  const created = source.createWindow('1', 'cover')
  const rejected = assert.rejects(created, /窗口异常关闭/)
  await new Promise(setImmediate)
  const win = FakeWindow.instances.at(-1)!
  const id = win.options.webPreferences.additionalArguments[0].slice('--winId='.length)
  win.destroy()
  await rejected
  assert.equal(ipc.listenerCount('result-page-' + id), 0)
  source.destroy()
})
