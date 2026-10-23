import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { registerHooks } from 'node:module'
import { runInNewContext } from 'node:vm'
import type { PageResponse } from '../../electron/services/common/browser-window.services.js'

const entry = 'https://www.ozon.ru/category/test'
const api = 'https://www.ozon.ru/api/test'
const good = (): PageResponse => ({ success: true, status: 200, contentType: 'application/json', url: api, redirected: false, data: { widgetStates: {} } })
const forbidden = (redirected = false): PageResponse => ({ success: false, status: 403, contentType: 'text/html', url: redirected ? 'https://www.ozon.ru/verify' : api, redirected, data: '<html>verify</html>' })
let respond: (url: string, win: FakeWindow) => Promise<PageResponse> | PageResponse = () => good()
let onLoad: (win: FakeWindow) => void = () => {}
const requests: string[] = []
const defaultSession = {}

class FakeContents extends EventEmitter {
  constructor(private win: FakeWindow) { super() }
  get session() { return this.win.options.webPreferences.session ?? defaultSession }
  getURL() { return this.win.url }
  isDestroyed() { return this.win.destroyed }
  stop() {}
  async executeJavaScript(script: string): Promise<any> {
    if (script.includes('const response = await fetch(')) {
      const url = JSON.parse(script.match(/fetch\(("(?:[^"\\]|\\.)*")/)![1]!)
      requests.push(url)
      return respond(url, this.win)
    }
    if (script.includes('Boolean(document.querySelector')) return this.win.challenge
    return false
  }
}
class FakeWindow extends EventEmitter {
  static instances: FakeWindow[] = []
  url = entry
  urls: string[] = []
  challenge = false
  destroyed = false
  readonly contents = new FakeContents(this)
  constructor(readonly options: any) { super(); FakeWindow.instances.push(this) }
  get webContents() { if (this.destroyed) throw new Error('destroyed'); return this.contents }
  isDestroyed() { return this.destroyed }
  async loadURL(url: string) {
    this.url = url
    this.urls.push(url)
    onLoad(this)
    queueMicrotask(() => this.contents.emit('dom-ready'))
  }
  destroy() { if (!this.destroyed) { this.destroyed = true; this.emit('closed') } }
}
;(globalThis as any).__requestElectron = { BrowserWindow: FakeWindow, app: { isPackaged: false } }
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'electron') return { url: 'test:request-electron', shortCircuit: true }
    if (specifier === '../../log/index.js') return { url: 'test:request-log', shortCircuit: true }
    return next(specifier, context)
  },
  load(url, context, next) {
    if (url === 'test:request-electron') return { format: 'module', shortCircuit: true, source: 'export const { BrowserWindow, app } = globalThis.__requestElectron;' }
    if (url === 'test:request-log') return { format: 'module', shortCircuit: true, source: 'export default { info() {}, warn() {}, error() {} };' }
    return next(url, context)
  },
})
const { OzonRequestWindowService, OzonVerificationError } = await import('../../electron/services/ozon/request-window.services.js')
const { MainWindowService } = await import('../../electron/services/collection/main-window.services.js')
const { BrowserWindowService } = await import('../../electron/services/common/browser-window.services.js')
const { ParseService } = await import('../../electron/services/collection/parse.services.js')
hooks.deregister()

function fixture(verify = async () => ({ success: true }), session: any = {}) {
  FakeWindow.instances = []
  requests.length = 0
  respond = () => good()
  onLoad = () => {}
  let attempts = 0
  const states: any[] = []
  const slider = { prepare: async () => {}, hasChallenge: async () => true, verify: async () => { attempts++; return verify() } }
  const worker = new OzonRequestWindowService(session, entry, state => states.push(state), { slider, settleMs: 0, requestTimeoutMs: 100, loadTimeoutMs: 1000 })
  return { worker, states, session, slider, attempts: () => attempts }
}

test('normal requests reuse one hidden window and its original Session', async () => {
  const f = fixture()
  try {
    await f.worker.request(api)
    await f.worker.request(api + '?second')
    assert.equal(FakeWindow.instances.length, 1)
    assert.equal(FakeWindow.instances[0]!.options.show, false)
    assert.equal(FakeWindow.instances[0]!.contents.session, f.session)
    assert.equal(f.attempts(), 0)
  } finally { f.worker.destroy() }
  assert.equal(FakeWindow.instances[0]!.destroyed, true)
})

test('403 without redirect rebuilds the request window, verifies, then replays the exact URL', async () => {
  let blocked = true
  const f = fixture(async () => { blocked = false; return { success: true } })
  respond = () => blocked ? forbidden() : good()
  try {
    assert.equal((await f.worker.request(api + '?id=1')).success, true)
    assert.equal(FakeWindow.instances.length, 2)
    assert.equal(FakeWindow.instances[0]!.destroyed, true)
    assert.equal(FakeWindow.instances[1]!.contents.session, f.session)
    assert.deepEqual(requests, [api + '?id=1', api + '?id=1'])
    assert.equal(f.attempts(), 1)
  } finally { f.worker.destroy() }
})

test('403 redirect navigates the existing request window to verification', async () => {
  let blocked = true
  const f = fixture(async () => { blocked = false; return { success: true } })
  respond = () => blocked ? forbidden(true) : good()
  try {
    await f.worker.request(api)
    assert.equal(FakeWindow.instances.length, 1)
    assert.deepEqual(FakeWindow.instances[0]!.urls, [entry, 'https://www.ozon.ru/verify'])
  } finally { f.worker.destroy() }
})

test('drag success does not bypass the response probe and recovery stops after exactly three attempts', async () => {
  const f = fixture()
  respond = () => forbidden()
  try {
    await assert.rejects(f.worker.request(api), OzonVerificationError)
    assert.equal(f.attempts(), 3)
    assert.equal(requests.length, 4)
    assert.equal(FakeWindow.instances.length, 4)
  } finally { f.worker.destroy() }
  assert.ok(FakeWindow.instances.every(win => win.destroyed))
})

test('a rebuilt window without a slider resumes only after a successful API probe', async () => {
  const f = fixture()
  f.slider.hasChallenge = async () => false
  respond = () => FakeWindow.instances.length === 1 ? forbidden() : good()
  try { await f.worker.request(api); assert.equal(f.attempts(), 0); assert.equal(requests.length, 2) }
  finally { f.worker.destroy() }
})

test('queued requests remain paused while verification runs', async () => {
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>()
  let blocked = true
  const f = fixture(async () => { entered.resolve(); await release.promise; blocked = false; return { success: true } })
  respond = () => blocked ? forbidden() : good()
  const first = f.worker.request(api)
  await entered.promise
  const second = f.worker.request(api + '?next')
  await new Promise(setImmediate)
  assert.deepEqual(requests, [api])
  release.resolve()
  try { await Promise.all([first, second]); assert.equal(requests.at(-1), api + '?next') }
  finally { f.worker.destroy() }
})

test('cancelling a queued request cannot release the active request or let later work overtake it', async () => {
  const f = fixture(), entered = Promise.withResolvers<void>(), release = Promise.withResolvers<PageResponse>()
  respond = url => { if (url === api) { entered.resolve(); return release.promise } return good() }
  const first = f.worker.request(api)
  await entered.promise
  const controller = new AbortController()
  const second = f.worker.request(api + '?cancelled', controller.signal)
  const rejected = assert.rejects(second, /cancel/)
  controller.abort(new Error('cancel'))
  await rejected
  const third = f.worker.request(api + '?third')
  await new Promise(setImmediate)
  assert.deepEqual(requests, [api])
  release.resolve(good())
  try { await Promise.all([first, third]); assert.deepEqual(requests, [api, api + '?third']) }
  finally { f.worker.destroy() }
})

test('destroy during hung verification rejects callers and releases the shared session gate', async () => {
  const entered = Promise.withResolvers<void>()
  const f = fixture(async () => { entered.resolve(); return new Promise(() => {}) })
  respond = () => forbidden()
  const first = f.worker.request(api)
  const rejected = assert.rejects(first, /回收/)
  await entered.promise
  f.worker.destroy()
  await rejected
  await new Promise(setImmediate)
  respond = () => good()
  const next = new OzonRequestWindowService(f.session, entry, undefined, { slider: f.slider, settleMs: 0, requestTimeoutMs: 50 })
  try { assert.equal((await next.request(api)).success, true) }
  finally { next.destroy() }
  assert.ok(FakeWindow.instances.every(win => win.destroyed))
})

test('normal fetch timeout rejects rather than stranding the queue', async () => {
  const f = fixture()
  respond = () => new Promise(() => {})
  try {
    await assert.rejects(f.worker.request(api), /超时/)
    respond = () => good()
    assert.equal((await f.worker.request(api)).success, true)
  } finally { f.worker.destroy() }
})

test('another task sharing the Session pauses its requests until verification finishes', async () => {
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>()
  let blocked = true
  const f = fixture(async () => { entered.resolve(); await release.promise; blocked = false; return { success: true } })
  respond = () => blocked ? forbidden() : good()
  const states: any[] = []
  const other = new OzonRequestWindowService(f.session, entry, state => states.push(state), { slider: f.slider, settleMs: 0 })
  const first = f.worker.request(api)
  await entered.promise
  const second = other.request(api + '?other')
  await new Promise(setImmediate)
  assert.deepEqual(requests, [api])
  assert.ok(states.some(state => state.phase === 'waiting'))
  release.resolve()
  try {
    await Promise.all([first, second])
    assert.equal(f.attempts(), 1)
    assert.equal(states.at(-1).phase, 'ready')
  } finally { f.worker.destroy(); other.destroy() }
})

test('cancelling a waiting task does not cancel the Session verification owner', async () => {
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>()
  let blocked = true
  const f = fixture(async () => { entered.resolve(); await release.promise; blocked = false; return { success: true } })
  respond = () => blocked ? forbidden() : good()
  const other = new OzonRequestWindowService(f.session, entry, undefined, { slider: f.slider, settleMs: 0 })
  const first = f.worker.request(api)
  await entered.promise
  const controller = new AbortController()
  const waiting = other.request(api + '?other', controller.signal)
  const rejected = assert.rejects(waiting, /cancel/)
  controller.abort(new Error('cancel waiting task'))
  await rejected
  release.resolve()
  try { assert.equal((await first).success, true); assert.equal(f.attempts(), 1) }
  finally { f.worker.destroy(); other.destroy() }
})

test('simultaneous 403 responses share one verification and each replay their own request', async () => {
  let blocked = true
  const f = fixture(async () => { blocked = false; return { success: true } })
  respond = () => blocked ? forbidden() : good()
  const other = new OzonRequestWindowService(f.session, entry, undefined, { slider: f.slider, settleMs: 0 })
  try {
    await Promise.all([f.worker.request(api), other.request(api + '?other')])
    assert.equal(f.attempts(), 1)
    assert.equal(requests.filter(url => url === api).length, 2)
    assert.equal(requests.filter(url => url.endsWith('?other')).length, 2)
  } finally { f.worker.destroy(); other.destroy() }
})

test('a waiting task can take over verification when the original owner is cancelled', async () => {
  const entered = Promise.withResolvers<void>()
  const f = fixture(async () => { entered.resolve(); return new Promise(() => {}) })
  let blocked = true, otherAttempts = 0
  respond = () => blocked ? forbidden() : good()
  const other = new OzonRequestWindowService(f.session, entry, undefined, {
    slider: { ...f.slider, verify: async () => { otherAttempts++; blocked = false; return { success: true } } }, settleMs: 0,
  })
  const first = f.worker.request(api)
  const rejected = assert.rejects(first, /回收/)
  await entered.promise
  const waiting = other.request(api + '?other')
  await new Promise(setImmediate)
  f.worker.destroy()
  try {
    await rejected
    assert.equal((await waiting).success, true)
    assert.equal(otherAttempts, 1)
  } finally { other.destroy() }
})

test('detail parser cannot swallow exhausted verification as an empty product', async () => {
  const error = new OzonVerificationError()
  const parse = new ParseService({ getSellingData: async () => { throw error } } as any)
  await assert.rejects(parse.ozonDetailParse({ success: true, data: { widgetStates: {} } }, 'https://www.ozon.ru', { _id: '123' }), value => value === error)
  parse.destroy()
})

test('business window delegates both API methods and stays on its original page', async () => {
  fixture()
  class Main extends MainWindowService { open() { return this.createBrowserWindow() } }
  const main = new Main(() => {})
  const business = main.open()
  try {
    await main.getSellingData(api)
    await main.getDataByApi('123')
    assert.equal(FakeWindow.instances.length, 2)
    assert.equal(business.urls.length, 0)
    assert.ok(requests[1]!.includes('123'))
  } finally { main.destroy() }
  assert.ok(FakeWindow.instances.every(win => win.destroyed))
})

test('fetch adapter preserves HTML 403 metadata instead of parsing it as JSON', async () => {
  class Adapter extends BrowserWindowService {
    open() { return this.createBrowserWindow() }
    read() { return this.fetchPage(api) }
  }
  const adapter = new Adapter()
  const win = adapter.open() as any as FakeWindow
  win.contents.executeJavaScript = script => runInNewContext(script, {
    window: {}, Map, AbortController,
    fetch: async () => ({ ok: false, status: 403, url: api, redirected: false, headers: { get: () => 'text/html' }, text: async () => '<html>slider</html>' }),
  })
  try {
    const response = await adapter.read()
    assert.equal(response.status, 403)
    assert.equal(response.data, '<html>slider</html>')
    assert.equal(response.contentType, 'text/html')
  } finally { adapter.destroy() }
})
