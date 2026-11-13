import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { setTimeout as delay } from 'node:timers/promises'
import { startElectron, waitForVite } from '../../scripts/start-electron.mjs'

test('Electron waits for frontend readiness and preserves its launch options', async () => {
  const gate = Promise.withResolvers<void>()
  const calls: any[] = []
  const child = {}
  const starting = startElectron({
    serverUrl: 'http://localhost:3000', args: ['--js-flags=--expose-gc'],
    wait: async url => { assert.equal(url, 'http://localhost:3000/login'); await gate.promise },
    launch: (...args) => { calls.push(args); return child },
  })
  await delay(10)
  assert.equal(calls.length, 0)
  gate.resolve()
  assert.equal(await starting, child)
  assert.deepEqual(calls[0][1], ['--inspect=0', '--js-flags=--expose-gc', '.'])
  assert.equal(calls[0][2].env.VITE_DEV_SERVER_URL, 'http://localhost:3000')
})

test('failed readiness prevents launching Electron and explicit inspector settings are preserved', async () => {
  let launched = false
  await assert.rejects(startElectron({
    wait: async () => { throw new Error('frontend failed') },
    launch: () => { launched = true },
  }), /frontend failed/)
  assert.equal(launched, false)
  await startElectron({
    args: ['--inspect-brk=9230'], wait: async () => {},
    launch: (_binary, args) => { assert.deepEqual(args, ['--inspect-brk=9230', '.']); return {} },
  })
})

test('readiness requires a successful Vite page and responds to a server becoming ready', async t => {
  let requests = 0, ready = false
  const server = createServer((_req, res) => {
    requests++
    res.writeHead(ready ? 200 : 503, { 'Content-Type': 'text/html' })
    res.end(ready ? '<script type="module" src="/@vite/client"></script>' : 'starting')
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => { server.closeAllConnections(); server.close() })
  const address = server.address() as { port: number }
  const url = `http://127.0.0.1:${address.port}/login`
  const waiting = waitForVite(url, { timeoutMs: 2000, retryMs: 10 })
  while (!requests) await delay(5)
  ready = true
  await waiting
  assert.ok(requests >= 2)
  ready = false
  await assert.rejects(waitForVite(url, { timeoutMs: 30, retryMs: 5 }), /超时/)
})
