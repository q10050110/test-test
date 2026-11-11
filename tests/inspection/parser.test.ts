import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ParseService as CollectionParser } from '../../electron/services/collection/parse.services.js'
import { ParseService as InspectionParser } from '../../electron/services/inspection/parse.services.js'
import { TaskTimeoutError } from '../../electron/services/common/task-scope.services.js'
import { VerificationFailedError } from '../../electron/services/common/verification-coordinator.services.js'

const domain = 'https://www.ozon.ru'
const card = (id: string) => `<article><a href="/product/item-${id}/"><img src="${id}.png"><div><span>商品${id}</span></div></a><span class="tsHeadline500Medium">1 200 ₽</span><span class="tsBodyControl400Small">原价 1 500 ₽</span><span class="tsBodyMBold">4.9100</span></article>`
const html = `<div id="contentScrollPaginator">${card('1')}${card('1')}${card('2')}</div><div data-widget="skuGrid"><a href="/product/3/">猜你喜欢</a><a>无效链接</a></div>`
const sellers = { success: true, data: { widgetStates: { 'webSellerList-new-version': JSON.stringify({ sellers: [
  { sku: 'a', price: { cardPrice: { price: '1 000 ₽' } } }, { sku: 'b', price: { cardPrice: { price: '900,50 ₽' } } },
] }) } } }

test('collection and inspection share DOM parsing and seller prices while keeping business fields', async () => {
  let requests = 0
  const source = { getSellingData: async () => { requests++; return sellers } }
  const collection = new CollectionParser(source)
  const inspection = new InspectionParser(source, () => 0)
  const [picked, followed] = await Promise.all([collection.ozonListParser(html, domain), inspection.ozonListParser(html, domain)])
  assert.equal(requests, 4)
  assert.equal(picked.length, 2)
  assert.equal(followed.length, 2)
  assert.equal(picked[0].price, 1200)
  assert.equal(picked[0].rating, '4.9')
  assert.equal(picked[0].reviewCountLabel, '100')
  assert.equal(picked[0].followMinPrice1, 900.5)
  assert.equal(followed[0].followMinPrice, 900.5)
  assert.equal(followed[0].followMaxPrice, 1000)
  assert.equal(followed[0].followList.length, 2)
  assert.equal(picked[0].followList, undefined)
  assert.equal(collection.guessLikeList.size, 1)
  assert.equal(collection.getDataCount(), 2)
  assert.deepEqual(await inspection.ozonListParser(html, domain), [])
  collection.destroy(); inspection.destroy()
})

test('collection seller requests start without a concurrency cap and preserve card order', async () => {
  const ids = ['1', '2', '3', '4', '5']
  const gates = ids.map(() => Promise.withResolvers<any>())
  const entered = Promise.withResolvers<void>()
  const started: string[] = []
  let active = 0, peak = 0
  const parser = new CollectionParser({ getSellingData: async url => {
    const id = new URLSearchParams(new URL(url).search).get('url')!.match(/product_id=(\d+)/)![1]!
    started.push(id)
    peak = Math.max(peak, ++active)
    if (started.length === ids.length) entered.resolve()
    try { return await gates[ids.indexOf(id)]!.promise }
    finally { active-- }
  } })
  const parsing = parser.ozonListParser(`<div id="contentScrollPaginator">${ids.map(card).join('')}</div>`, domain)
  try {
    await entered.promise
    assert.deepEqual(started, ids)
    assert.equal(parser.getDataCount(), 5)
    gates[1]!.resolve(sellers)
    assert.equal(parser.getDataCount(), 5)
    for (const gate of gates) gate.resolve(sellers)
    const result = await parsing
    assert.deepEqual(result.map(goods => goods.id), ids)
    assert.equal(peak, 5)
    assert.equal(parser.getDataCount(), 5)
  } finally { for (const gate of gates) gate.resolve(sellers); parser.destroy(); await parsing.catch(() => undefined) }
})

test('failed collection batches count discovered cards but leave every undelivered product available for retry', async () => {
  const entered = Promise.withResolvers<void>(), failure = Promise.withResolvers<any>()
  let calls = 0, aborted = 0, fail = true
  const parser = new CollectionParser({ getSellingData: async (_url, signal) => {
    const index = calls++
    if (!fail) return sellers
    if (calls === 4) entered.resolve()
    if (index === 0) return failure.promise
    signal!.addEventListener('abort', () => { aborted++ }, { once: true })
    return new Promise(() => {})
  } })
  const page = `<div id="contentScrollPaginator">${['1', '2', '3', '4'].map(card).join('')}</div>`
  const parsing = parser.ozonListParser(page, domain)
  const rejected = assert.rejects(parsing, /verification failed/)
  await entered.promise
  failure.reject(new Error('verification failed'))
  await rejected
  assert.equal(calls, 4)
  assert.equal(aborted, 3)
  assert.equal(parser.getDataCount(), 4)
  fail = false
  assert.deepEqual((await parser.ozonListParser(page, domain)).map(goods => goods.id), ['1', '2', '3', '4'])
  assert.equal(calls, 8)
  assert.equal(parser.getDataCount(), 4)
  parser.destroy()
})

test('overlapping page snapshots launch new seller requests while deduplicating in-flight IDs', { timeout: 2000 }, async () => {
  const gate = Promise.withResolvers<void>(), entered = Promise.withResolvers<void>()
  const started: string[] = []
  const parser = new CollectionParser({ getSellingData: async url => {
    started.push(decodeURIComponent(url).match(/product_id=(\d+)/)![1]!)
    if (started.length === 4) entered.resolve()
    await gate.promise
    return sellers
  } })
  const page = (ids: string[]) => `<div id="contentScrollPaginator">${ids.map(card).join('')}</div>`
  const first = parser.ozonListParser(page(['1', '2', '3']), domain)
  const second = parser.ozonListParser(page(['2', '3', '4']), domain)
  try {
    await entered.promise
    assert.deepEqual(started, ['1', '2', '3', '4'])
    assert.equal(parser.getDataCount(), 4)
    gate.resolve()
    assert.deepEqual((await first).map(goods => goods.id), ['1', '2', '3'])
    assert.deepEqual((await second).map(goods => goods.id), ['4'])
  } finally { gate.resolve(); await Promise.allSettled([first, second]); parser.destroy() }
})

test('a collection seller timeout skips only that product and leaves it available for retry', async () => {
  const gate = Promise.withResolvers<void>(), failed = Promise.withResolvers<void>()
  const received: string[] = [], failures: string[] = [], requests: string[] = []
  let fail = true, aborted = false
  const parser = new CollectionParser({ getSellingData: async (url, signal) => {
    const id = decodeURIComponent(url).match(/product_id=(\d+)/)![1]!
    requests.push(id)
    if (id === '1' && fail) throw new TaskTimeoutError('OZON 接口请求')
    signal!.addEventListener('abort', () => { aborted = true }, { once: true })
    await gate.promise
    return sellers
  } }, { error() {} })
  const parsing = parser.ozonListParser(html, domain, undefined, async goods => { received.push(goods.id) }, undefined,
    (goods, error) => { assert.ok(error instanceof TaskTimeoutError); failures.push(goods.id); failed.resolve() })
  try {
    await failed.promise
    assert.equal(aborted, false)
    assert.deepEqual(failures, ['1'])
    gate.resolve()
    assert.deepEqual((await parsing).map(goods => goods.id), ['2'])
    assert.deepEqual(received, ['2'])
    fail = false
    assert.deepEqual((await parser.ozonListParser(html, domain)).map(goods => goods.id), ['1'])
    assert.deepEqual(requests, ['1', '2', '1'])
    assert.equal(parser.getDataCount(), 2)
  } finally { gate.resolve(); await parsing.catch(() => undefined); parser.destroy() }
})

test('collection seller verification failure still rejects the page', async () => {
  const parser = new CollectionParser({ getSellingData: async () => { throw new VerificationFailedError('verification exhausted') } })
  try { await assert.rejects(parser.ozonListParser(html, domain), /verification exhausted/) }
  finally { parser.destroy() }
})

test('streamed products are consumed before the page drains and retries skip only delivered IDs', async () => {
  const failure = Promise.withResolvers<any>(), delivered = Promise.withResolvers<void>()
  const received: string[] = []
  let fail = true
  const parser = new CollectionParser({ getSellingData: async url => {
    if (fail && decodeURIComponent(url).includes('product_id=2&')) return failure.promise
    return sellers
  } })
  const consume = async (goods: any) => { received.push(goods.id); delivered.resolve() }
  const parsing = parser.ozonListParser(html, domain, undefined, consume)
  const rejected = assert.rejects(parsing, /verification failed/)
  await delivered.promise
  // 累计数已按整批登记；交付去重仍只提交已被下游接收的商品。
  await new Promise(setImmediate)
  assert.equal(parser.getDataCount(), 2)
  failure.reject(new Error('verification failed'))
  await rejected
  fail = false
  assert.deepEqual((await parser.ozonListParser(html, domain, undefined, consume)).map(goods => goods.id), ['2'])
  assert.deepEqual(received, ['1', '2'])
  assert.equal(parser.getDataCount(), 2)
  parser.destroy()
})

test('a rejected streaming consumer cancels peers and leaves the product available for retry', async () => {
  const parser = new CollectionParser({ getSellingData: async () => sellers })
  await assert.rejects(parser.ozonListParser(html, domain, undefined, async () => {
    throw new Error('consumer failed')
  }), /consumer failed/)
  assert.equal(parser.getDataCount(), 2)
  assert.equal((await parser.ozonListParser(html, domain)).length, 2)
  parser.destroy()
})

test('collection cumulative count adds unique IDs per batch and deduplicates across page and category batches', async () => {
  const parser = new CollectionParser({ getSellingData: async () => sellers })
  const totals: number[] = [], batches: string[][] = []
  const observe = (goods: readonly any[]) => { totals.push(parser.getDataCount()); batches.push(goods.map(item => item.id)) }
  const page = (ids: string[]) => `<div id="contentScrollPaginator">${ids.map(card).join('')}</div>`
  await parser.ozonListParser(page(['1', '1', '2', '3']), domain, undefined, undefined, observe)
  await parser.ozonListParser(page(['2', '3', '4', '4']), domain, undefined, undefined, observe)
  await parser.ozonListParser(page(['1', '2', '3', '4']), domain, undefined, undefined, observe)
  assert.deepEqual(totals, [3, 4])
  assert.deepEqual(batches, [['1', '2', '3'], ['4']])
  const unique = await parser.ozonDetailListParser([{ _id: '4' }, { _id: '5' }, { _id: '5' }])
  assert.deepEqual(unique.map(item => item._id), ['5'])
  assert.equal(parser.getDataCount(), 5)
  parser.destroy()
  assert.equal(parser.getDataCount(), 0)
})

test('failed batches do not poison deduplication or lose the earlier successful product', async () => {
  let calls = 0, fail = true
  const parser = new InspectionParser({ getSellingData: async () => { if (++calls === 2 && fail) throw new Error('403 exhausted'); return sellers } }, () => 0)
  await assert.rejects(parser.ozonListParser(html, domain), /403 exhausted/)
  assert.equal(parser.getDataCount(), 0)
  fail = false
  assert.equal((await parser.ozonListParser(html, domain)).length, 2)
  parser.destroy()
})

test('cancellation after a late seller response neither commits IDs nor continues the batch', async () => {
  const gate = Promise.withResolvers<any>(), entered = Promise.withResolvers<void>(), controller = new AbortController()
  let calls = 0
  const parser = new InspectionParser({ getSellingData: async () => { calls++; entered.resolve(); return gate.promise } }, () => 0)
  const running = parser.ozonListParser(html, domain, controller.signal)
  const rejected = assert.rejects(running, /cancel/)
  await entered.promise
  controller.abort(new Error('cancel'))
  gate.resolve(sellers)
  await rejected
  assert.equal(calls, 1)
  assert.equal(parser.getDataCount(), 0)
  parser.destroy()
})

test('empty seller data preserves each business default and category batches deduplicate internally', async () => {
  const source = { getSellingData: async () => ({ success: true, data: { widgetStates: {} } }) }
  const inspection = new InspectionParser(source, () => 0), collection = new CollectionParser(source)
  assert.equal((await inspection.ozonListParser(html, domain))[0].sellerNumber, 0)
  assert.equal((await collection.ozonListParser(html, domain))[0].sellerNumber, undefined)
  assert.equal((await collection.ozonDetailListParser([{ _id: '9' }, { _id: '9' }, { _id: '' }])).length, 1)
  inspection.destroy(); collection.destroy()
  assert.equal(collection.getDataCount(), 0)
  assert.equal(collection.guessLikeList.size, 0)
})

test('destroy invalidates a pending parse even when the caller did not supply a signal', async () => {
  const gate = Promise.withResolvers<any>()
  const parser = new InspectionParser({ getSellingData: async () => gate.promise }, () => 0)
  const parsing = parser.ozonListParser(html, domain)
  const rejected = assert.rejects(parsing, /释放/)
  parser.destroy()
  gate.resolve(sellers)
  await rejected
  assert.equal(parser.getDataCount(), 0)
})
