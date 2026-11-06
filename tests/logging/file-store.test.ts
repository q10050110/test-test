import { test, type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import {
  LogFileStore,
  listLogFiles,
  logFileInfo,
  type LogPolicy,
  type LogCategory,
} from '../../electron/log/file-store.js'

const policy = (maxFileBytes = 32, maxTotalBytes = 4096, retentionDays = 7): LogPolicy => ({
  maxFileBytes,
  maxTotalBytes,
  retentionDays,
})
function fixture(t: TestContext, policies = { system: policy(), business: policy() }) {
  const prefix = join(tmpdir(), 'shopbang-log-tests-')
  const directory = mkdtempSync(prefix)
  t.after(() => {
    assert.ok(directory.startsWith(prefix))
    rmSync(directory, { recursive: true, force: true })
  })
  let date = new Date(2026, 10, 6, 10)
  const errors: unknown[] = []
  const create = () =>
    new LogFileStore(
      directory,
      policies,
      () => date,
      (error) => errors.push(error),
    )
  const files = (category: LogCategory) =>
    listLogFiles(directory)
      .filter((path) => logFileInfo(basename(path))?.category === category)
      .sort()
  const content = (category: LogCategory) =>
    files(category)
      .map((path) => readFileSync(path, 'utf8'))
      .join('')
  const size = (category: LogCategory) =>
    files(category).reduce((sum, path) => sum + statSync(path).size, 0)
  return {
    directory,
    create,
    files,
    content,
    size,
    errors,
    setDate: (value: Date) => {
      date = value
    },
  }
}

test('appending and repeated rotation preserve every record without overwriting previous volumes', (t) => {
  const f = fixture(t)
  const store = f.create()
  const records = Array.from(
    { length: 30 },
    (_, index) => `record-${String(index).padStart(2, '0')}\n`,
  )
  records.forEach((record) => assert.equal(store.write('business', record), true))
  assert.equal(f.content('business'), records.join(''))
  assert.ok(f.files('business').length > 2)
  for (const file of f.files('business')) assert.ok(statSync(file).size <= 32)
  assert.deepEqual(f.errors, [])
})

test('normal records stay in one file when the previous volume has insufficient space', (t) => {
  const f = fixture(t)
  const store = f.create()
  store.write('system', 'a'.repeat(20))
  store.write('system', 'b'.repeat(20))
  assert.deepEqual(
    f.files('system').map((file) => readFileSync(file, 'utf8')),
    ['a'.repeat(20) + '\n', 'b'.repeat(20) + '\n'],
  )
})

test('oversized Chinese and emoji messages are split losslessly into valid UTF-8 volumes', (t) => {
  const f = fixture(t)
  const store = f.create()
  const record = '日志😀'.repeat(30)
  store.write('system', 'prefix')
  assert.equal(store.write('system', record), true)
  const decoder = new TextDecoder('utf-8', { fatal: true })
  for (const file of f.files('system')) {
    const bytes = readFileSync(file)
    assert.ok(bytes.length <= 32)
    assert.doesNotThrow(() => decoder.decode(bytes))
  }
  assert.equal(f.content('system'), `prefix\n${record}\n`)
})

test('each category has an independent hard quota and removes its oldest volumes first', (t) => {
  const f = fixture(t, { system: policy(32, 64), business: policy(32, 64) })
  const store = f.create()
  store.write('system', 'keep-system')
  for (let i = 0; i < 20; i++) {
    store.write('business', `record-${i}:` + 'x'.repeat(20))
    assert.ok(f.size('business') <= 64)
    assert.ok(f.size('system') <= 64)
  }
  assert.equal(f.content('system'), 'keep-system\n')
  assert.ok(f.content('business').includes('record-19:'))
  assert.equal(f.content('business').includes('record-0:'), false)
})

test('restarting at the same time creates unique filenames and preserves existing content', (t) => {
  const f = fixture(t)
  f.create().write('system', 'before-restart')
  f.create().write('system', 'after-restart')
  assert.equal(f.files('system').length, 2)
  assert.ok(f.content('system').includes('before-restart'))
  assert.ok(f.content('system').includes('after-restart'))
})

test('retention uses local calendar dates, works across midnight and keeps category policies separate', (t) => {
  const f = fixture(t, { system: policy(32, 4096, 2), business: policy(32, 4096, 3) })
  const store = f.create()
  store.write('system', 'day-6-system')
  store.write('business', 'day-6-business')
  f.setDate(new Date(2026, 10, 7, 0, 1))
  store.write('system', 'day-7-system')
  assert.ok(f.content('system').includes('day-6-system'))
  f.setDate(new Date(2026, 10, 8, 0, 1))
  store.write('system', 'day-8-system')
  assert.equal(f.content('system').includes('day-6-system'), false)
  assert.ok(f.content('system').includes('day-7-system'))
  assert.ok(f.content('business').includes('day-6-business'))
  f.setDate(new Date(2026, 10, 9))
  store.write('business', 'day-9-business')
  assert.equal(f.content('business').includes('day-6-business'), false)
})

test('startup accounts for legacy .log and .old.log files and exports every recognized volume', (t) => {
  const f = fixture(t)
  writeFileSync(join(f.directory, '2026-11-05.log'), 'old\n')
  writeFileSync(join(f.directory, '2026-11-05.old.log'), 'archive\n')
  writeFileSync(join(f.directory, '2026-10-01.log'), 'expired\n')
  writeFileSync(join(f.directory, 'notes.txt'), 'unrelated')
  mkdirSync(join(f.directory, '2026-11-06.log'))
  f.create().write('business', 'new')
  const names = listLogFiles(f.directory).map((file) => basename(file))
  assert.equal(names.length, 3)
  assert.ok(names.includes('2026-11-05.log'))
  assert.ok(names.includes('2026-11-05.old.log'))
  assert.equal(readFileSync(join(f.directory, 'notes.txt'), 'utf8'), 'unrelated')
})

test('startup removes excess legacy bytes before accepting new records', (t) => {
  const f = fixture(t, { system: policy(32, 64), business: policy(32, 64) })
  writeFileSync(join(f.directory, '2026-11-04.log'), 'a'.repeat(40))
  writeFileSync(join(f.directory, '2026-11-05.old.log'), 'b'.repeat(40))
  const store = f.create()
  assert.ok(f.size('system') <= 64)
  assert.equal(store.write('system', 'newest'), true)
  assert.ok(f.size('system') <= 64)
  assert.ok(f.content('system').includes('newest'))
})

test('an unavailable log path cannot throw into the business caller', (t) => {
  const f = fixture(t)
  const store = f.create()
  // 使用同一测试目录内的同名文件模拟日志目录不可用。
  const blocked = new LogFileStore(
    f.directory,
    { system: policy(), business: policy() },
    undefined,
    (error) => f.errors.push(error),
  )
  blocked.write('system', 'ready')
  const file = listLogFiles(f.directory)[0]!
  // 将卷路径换成目录，使下一次追加失败，不依赖 Windows ACL 权限。
  rmSync(file)
  mkdirSync(file)
  assert.doesNotThrow(() => blocked.write('system', 'cannot append'))
  assert.equal(f.errors.length, 1)
  assert.equal(store.write('business', 'business continues'), true)
})

test('invalid limits are rejected and unknown files are excluded from log discovery', (t) => {
  const f = fixture(t)
  assert.throws(
    () => new LogFileStore(f.directory, { system: policy(32, 16), business: policy() }),
    /配置无效/,
  )
  assert.equal(logFileInfo('arbitrary.txt'), undefined)
  assert.deepEqual(logFileInfo('2026-11-06.business.run-1.000001.txt'), {
    date: '2026-11-06',
    category: 'business',
  })
  assert.deepEqual(readdirSync(f.directory), [])
})
