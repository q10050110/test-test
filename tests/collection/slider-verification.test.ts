import { test } from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { runInNewContext } from 'node:vm'

const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'electron') return { url: 'test:slider-electron', shortCircuit: true }
    if (specifier === '../../log/index.js') return { url: 'test:slider-log', shortCircuit: true }
    return next(specifier, context)
  },
  load(url, context, next) {
    if (url === 'test:slider-electron') return { format: 'module', shortCircuit: true, source: 'export const app = { isPackaged: false };' }
    if (url === 'test:slider-log') return { format: 'module', shortCircuit: true, source: 'export default { info() {} };' }
    return next(url, context)
  },
})
const { SliderVerificationService } = await import('../../electron/services/common/slider-verification.services.js')
hooks.deregister()

function fixture(sources = ['https://cdn.example/background.png', 'https://cdn.example/puzzle.png']) {
  const calls: { url: string; options: any }[] = []
  let drawn = 0
  const makeImage = (source: string) => ({
    src: source, currentSrc: source, complete: true, naturalWidth: 20, naturalHeight: 20, isConnected: true,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 20, height: 20 }),
  })
  const elements: Record<string, any> = { '#image': makeImage(sources[0]!), '#puzzle': makeImage(sources[1]!), '#slider': makeImage('') }
  class CleanImage {
    src = ''
    naturalWidth = 20
    naturalHeight = 20
    async decode() {}
  }
  const document = {
    querySelector: (selector: string) => elements[selector],
    createElement: () => ({
      width: 0, height: 0,
      getContext: () => ({
        drawImage(image: any) {
          // 模拟浏览器对跨域原图的限制，只有独立 data URL 图片可以读取像素。
          if (!(image instanceof CleanImage)) throw new Error('tainted by cross-origin data')
          drawn++
        },
        getImageData: () => ({ data: new Uint8Array(20 * 20 * 4) }),
      }),
    }),
  }
  const wc = {
    session: { async fetch(url: string, options: any) {
      calls.push({ url, options })
      return { ok: true, status: 200, headers: { get: () => 'image/png' }, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer }
    } },
    async executeJavaScript(script: string): Promise<any> {
      return runInNewContext(script, { document, window: { cv: { imread() {} } }, Image: CleanImage, performance, setTimeout, console })
    },
  }
  return { wc, calls, elements, drawn: () => drawn }
}

test('cross-origin captcha images use the original Session and clean canvas copies', async () => {
  const f = fixture()
  const result = await new SliderVerificationService().verify(f.wc as any)
  // 透明测试图没有拼图轮廓，但必须先成功读取 Canvas，不能因跨域失败。
  assert.equal(result.reason, 'invalid_puzzle_bounds')
  assert.equal(f.drawn(), 1)
  assert.deepEqual(f.calls.map(call => call.url), ['https://cdn.example/background.png', 'https://cdn.example/puzzle.png'])
  assert.ok(f.calls.every(call => call.options.credentials === 'include'))
  assert.equal(f.elements['#puzzle'].src, 'https://cdn.example/puzzle.png')
})

test('inline captcha images do not issue network requests', async () => {
  const f = fixture(['data:image/png;base64,AQID', 'data:image/png;base64,BAUG'])
  const result = await new SliderVerificationService().verify(f.wc as any)
  assert.equal(result.reason, 'invalid_puzzle_bounds')
  assert.equal(f.calls.length, 0)
})

test('HTML image responses fail explicitly before image matching or pointer events', async () => {
  const f = fixture()
  f.wc.session.fetch = async () => ({ ok: true, status: 200, headers: { get: () => 'text/html' }, arrayBuffer: async () => new ArrayBuffer(0) })
  await assert.rejects(new SliderVerificationService().verify(f.wc as any), /响应不是图片/)
  assert.equal(f.drawn(), 0)
})

test('cancelling image loading aborts the Session request and rejects verification', async () => {
  const f = fixture(), entered = Promise.withResolvers<AbortSignal>()
  f.wc.session.fetch = async (_url, options) => {
    entered.resolve(options.signal)
    return new Promise(() => {})
  }
  const controller = new AbortController()
  const verification = new SliderVerificationService().verify(f.wc as any, controller.signal)
  const rejected = assert.rejects(verification, /cancel image/)
  const requestSignal = await entered.promise
  controller.abort(new Error('cancel image'))
  await rejected
  assert.equal(requestSignal.aborted, true)
})

test('captcha replacement during image loading prevents dragging with stale pixels', async () => {
  const f = fixture(), fetch = f.wc.session.fetch
  f.wc.session.fetch = async (url, options) => {
    const result = await fetch(url, options)
    f.elements['#puzzle'].currentSrc = 'https://cdn.example/new-puzzle.png'
    return result
  }
  const result = await new SliderVerificationService().verify(f.wc as any)
  assert.equal(result.reason, 'captcha_changed')
  assert.equal(f.drawn(), 0)
})
