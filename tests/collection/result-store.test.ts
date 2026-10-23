import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { CollectionResultStore } from '../../electron/services/collection/collection-result-store.services.js'

test('result cache stores goods separately from small summaries, survives restart and deletes both files', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'collection-results-'))
  try {
    const store = new CollectionResultStore(directory)
    const result = {
      status: 'completed' as const,
      filePath: '',
      progress: { current: 0, total: 1, totalCount: 1 },
      hasUpLimit: false,
      upGoodsList: [{ id: '1', cover: 'image'.repeat(1000) }],
    }
    const summary = await store.save('../../task', result)
    assert.equal('upGoodsList' in summary, false)
    const reopened = new CollectionResultStore(directory)
    assert.deepEqual(await reopened.summary('../../task'), summary)
    assert.deepEqual(await reopened.goods('../../task'), result.upGoodsList)
    assert.equal((await readdir(directory)).length, 2)
    await reopened.remove('../../task')
    assert.equal(await reopened.summary('../../task'), undefined)
    assert.deepEqual(await readdir(directory), [])
  } finally {
    assert.equal(resolve(dirname(directory)), resolve(tmpdir()))
    assert.ok(basename(directory).startsWith('collection-results-'))
    await rm(directory, { recursive: true, force: true })
  }
})
