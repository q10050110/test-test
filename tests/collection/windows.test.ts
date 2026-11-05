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
  getURL() {
    return 'https://test/page'
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
        source: 'export const { BrowserWindow, ipcMain } = globalThis.__collectionElectron; export const app = { isPackaged: false };',
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
const { BrowserWindowService } = await import('../../electron/services/common/browser-window.services.js')
const { MainWindowService: InspectionWindowService } = await import('../../electron/services/inspection/main-window.services.js')
hooks.deregister()

class TestWindowService extends BrowserWindowService {
  async open(timeoutMs = 1000) {
    const win = this.createBrowserWindow()
    try {
      await this.loadWindow(win, 'https://test', { timeoutMs })
      return win
    } catch (error) {
      this.destroy()
      throw error
    }
  }
}

test('shared window load deadline destroys the window and detaches all owned listeners', async () => {
  const service = new TestWindowService()
  await assert.rejects(service.open(10), /超时/)
  const win = FakeWindow.instances.at(-1)!
  assert.equal(win.destroyed, true)
  assert.equal(win.listenerCount('closed'), 0)
  assert.equal(win.contents.listenerCount('did-finish-load'), 0)
  assert.equal(win.contents.listenerCount('render-process-gone'), 0)
})

test('shared window crash rejects the pending load and notifies the owner once', async () => {
  let closed = 0
  const service = new TestWindowService(() => { closed++ })
  const opened = service.open()
  const rejected = assert.rejects(opened, /渲染进程退出/)
  const win = FakeWindow.instances.at(-1)!
  win.contents.emit('render-process-gone')
  await rejected
  service.destroy()
  assert.equal(closed, 1)
  assert.equal(win.listenerCount('closed'), 0)
})

test('shared HTML reader rejects late content after cancellation', async () => {
  const service = new TestWindowService()
  const opened = service.open()
  const win = FakeWindow.instances.at(-1)!
  win.contents.emit('did-finish-load')
  await opened
  const gate = Promise.withResolvers<string>()
  win.contents.executeJavaScript = () => gate.promise
  const controller = new AbortController()
  const content = service.getHTML(controller.signal)
  const rejected = assert.rejects(content, /cancel/)
  controller.abort(new Error('cancel'))
  gate.resolve('<html>late</html>')
  await rejected
  service.destroy()
})

test('inspection inherits loading but still awaits its private page checks', async () => {
  const service = new InspectionWindowService(() => {})
  const gate = Promise.withResolvers<void>()
  let checked = false
  service.checkPage = async () => { await gate.promise; checked = true }
  const opened = service.createCollectionWindow('https://test')
  const win = FakeWindow.instances.at(-1)!
  assert.equal(win.options.webPreferences.webSecurity, false)
  win.contents.emit('dom-ready')
  await new Promise(resolve => setTimeout(resolve, 5))
  assert.equal(checked, false)
  gate.resolve()
  await opened
  assert.equal(checked, true)
  service.destroy()
  assert.equal(win.listenerCount('closed'), 0)
})

test('inspection page-check rejection closes its inherited window', async () => {
  const service = new InspectionWindowService(() => {})
  service.checkPage = async () => { throw new Error('page check failed') }
  const opened = service.createCollectionWindow('https://test')
  const rejected = assert.rejects(opened, /page check failed/)
  const win = FakeWindow.instances.at(-1)!
  win.contents.emit('dom-ready')
  await rejected
  assert.equal(win.destroyed, true)
})

test('collection awaits verification on startup even when no HTML will be read', async () => {
  const service = new MainWindowService(() => {})
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>()
  service.checkPage = async () => { entered.resolve(); await release.promise }
  let ready = false
  const opened = service.createCollectionWindow('https://test').then(win => { ready = true; return win })
  const win = FakeWindow.instances.at(-1)!
  win.contents.emit('dom-ready')
  try {
    await entered.promise
    assert.equal(ready, false)
    release.resolve()
    await opened
    assert.equal(ready, true)
  } finally { release.resolve(); service.destroy() }
})

test('collection startup verification failure rejects and closes the window', async () => {
  const service = new MainWindowService(() => {})
  service.checkPage = async () => { throw new Error('page check failed') }
  const opened = service.createCollectionWindow('https://test')
  const rejected = assert.rejects(opened, /page check failed/)
  const win = FakeWindow.instances.at(-1)!
  win.contents.emit('dom-ready')
  await rejected
  assert.equal(win.destroyed, true)
})

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
