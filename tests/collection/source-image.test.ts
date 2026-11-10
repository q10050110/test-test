import { test } from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { TaskCancelledError } from '../../electron/services/common/task-scope.services.js'

const hook = registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'electron') return { url: 'source-image:electron', shortCircuit: true }
    if (specifier === '../../log/business.js')
      return { url: 'source-image:log', shortCircuit: true }
    return next(specifier, context)
  },
  load(url, context, next) {
    if (url === 'source-image:electron')
      return {
        format: 'module',
        shortCircuit: true,
        source: 'export class BrowserWindow {} export const ipcMain = {};',
      }
    if (url === 'source-image:log')
      return { format: 'module', shortCircuit: true, source: 'export default { info() {} };' }
    return next(url, context)
  },
})
const { WindowService } = await import('../../electron/services/collection/1688-window.services.js')
hook.deregister()

function fixture() {
  const source: any = new WindowService({} as any)
  const calls: any[] = [],
    scripts: string[] = []
  const win: any = {
    webContents: {
      session: {
        fetch: async (url: string, options: any) => {
          calls.push({ url, options })
          return {
            ok: true,
            status: 200,
            headers: { get: () => 'image/webp; charset=binary' },
            arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
          }
        },
      },
      executeJavaScript: async (script: string) => {
        scripts.push(script)
      },
    },
  }
  return { source, win, calls, scripts }
}

test('1688 source images use Session fetch and preserve image bytes and MIME type', async () => {
  const f = fixture()
  const image = await f.source.loadSourceImage(
    f.win,
    'https://cdn.example.test/image.webp',
    new AbortController().signal,
  )
  assert.deepEqual(image, { base64: 'AQID', mime: 'image/webp' })
  assert.equal(f.calls[0].url, 'https://cdn.example.test/image.webp')
  assert.equal(f.calls[0].options.credentials, 'include')
  assert.equal(f.scripts.length, 0)
})

test('HTML, HTTP failures and empty image responses fail before uploading', async () => {
  for (const response of [
    { ok: false, status: 403, headers: { get: () => 'text/html' } },
    { ok: true, status: 200, headers: { get: () => 'text/html' } },
    {
      ok: true,
      status: 200,
      headers: { get: () => 'image/png' },
      arrayBuffer: async () => new ArrayBuffer(0),
    },
  ]) {
    const f = fixture()
    f.win.webContents.session.fetch = async () => response
    await assert.rejects(
      f.source.loadSourceImage(
        f.win,
        'https://cdn.example.test/image',
        new AbortController().signal,
      ),
      /HTTP 403|不是图片|内容为空/,
    )
    assert.equal(f.scripts.length, 0)
  }
})

test('cancelling image loading aborts the Session request immediately', async () => {
  const f = fixture(),
    entered = Promise.withResolvers<void>(),
    controller = new AbortController()
  let aborted = false
  f.win.webContents.session.fetch = async (_url: string, options: any) => {
    options.signal.addEventListener(
      'abort',
      () => {
        aborted = true
      },
      { once: true },
    )
    entered.resolve()
    return new Promise(() => {})
  }
  const running = f.source.loadSourceImage(
    f.win,
    'https://cdn.example.test/image',
    controller.signal,
  )
  const rejected = assert.rejects(running, TaskCancelledError)
  await entered.promise
  controller.abort(new TaskCancelledError())
  await rejected
  assert.equal(aborted, true)
  assert.equal(f.scripts.length, 0)
})

test(
  'upload receives downloaded bytes and no longer fetches the remote image in the 1688 page',
  { timeout: 5000 },
  async () => {
    const f = fixture()
    await f.source.startSearch(
      f.win,
      'https://cdn.example.test/image.webp',
      new AbortController().signal,
    )
    assert.equal(f.calls.length, 1)
    assert.ok(f.scripts[0]!.includes('AQID'))
    assert.ok(f.scripts[0]!.includes('image/webp'))
    assert.equal(f.scripts[0]!.includes('await fetch('), false)
    assert.ok(f.scripts[0]!.includes('uploadInput.files = dataTransfer.files'))
  },
)
