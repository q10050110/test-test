import { test, type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { LogFileStore, LOG_POLICIES, listLogFiles, logFileInfo, localLogDate } from '../../electron/log/file-store.js'

function fixture(t: TestContext) {
  const directory = mkdtempSync(join(tmpdir(), 'shopbang-log-tests-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  let date = new Date(2026, 10, 6, 10)
  const errors: unknown[] = []
  const create = () => new LogFileStore(directory, LOG_POLICIES, () => date, error => errors.push(error))
  const files = (category: 'system' | 'business') => listLogFiles(directory)
    .filter(file => logFileInfo(basename(file))?.category === category).sort()
  const write = (store: LogFileStore, category: 'system' | 'business', text: string, taskId?: string) => {
    const result = store.write(category, text, taskId)
    // 使用测试时钟同步业务文件的修改时间，模拟文件系统的真实写入时间。
    if (result && category === 'business' && taskId && /^[a-zA-Z0-9_-]+$/.test(taskId))
      utimesSync(join(directory, 'business.' + taskId + '.txt'), date, date)
    return result
  }
  return { directory, create, files, write, errors, setDate: (value: Date) => { date = value } }
}

test('system writes and restarts append to one file per local day without size rotation', t => {
  const f = fixture(t)
  const first = f.create()
  const record = '日志😀'.repeat(1024 * 1024)
  assert.equal(f.write(first, 'system', 'before-restart'), true)
  assert.equal(f.write(first, 'system', record), true)
  assert.equal(f.write(f.create(), 'system', 'after-restart'), true)
  assert.equal(f.files('system').length, 1)
  assert.equal(basename(f.files('system')[0]!), '2026-11-06.system.txt')
  assert.equal(readFileSync(f.files('system')[0]!, 'utf8'), 'before-restart\n' + record + '\nafter-restart\n')
  f.setDate(new Date(2026, 10, 7))
  f.write(first, 'system', 'next-day')
  assert.equal(f.files('system').length, 2)
  assert.deepEqual(f.errors, [])
})

test('business files isolate task IDs and append to the same task across restarts and midnight', t => {
  const f = fixture(t), first = f.create()
  f.write(first, 'business', 'a-first', 'task-a')
  f.write(first, 'business', 'b-only', 'task-b')
  const restarted = f.create()
  f.setDate(new Date(2026, 10, 7, 0, 1))
  f.write(restarted, 'business', 'a-restarted', 'task-a')
  f.write(first, 'business', 'a-shared', 'task-a')
  assert.equal(f.files('business').length, 2)
  assert.equal(readFileSync(join(f.directory, 'business.task-a.txt'), 'utf8'), 'a-first\na-restarted\na-shared\n')
  assert.equal(readFileSync(join(f.directory, 'business.task-b.txt'), 'utf8'), 'b-only\n')
})

test('system retains three calendar days and business retains two since its last write', t => {
  const f = fixture(t), store = f.create()
  f.write(store, 'system', 'day-6')
  f.write(store, 'business', 'old-task', 'old')
  f.write(store, 'business', 'active-task', 'active')
  f.setDate(new Date(2026, 10, 7))
  f.write(store, 'system', 'day-7')
  f.write(store, 'business', 'active-updated', 'active')
  f.setDate(new Date(2026, 10, 8))
  store.cleanup()
  assert.equal(f.files('system').length, 2)
  assert.deepEqual(f.files('business').map(file => basename(file)), ['business.active.txt'])
  f.write(store, 'system', 'day-8')
  f.setDate(new Date(2026, 10, 9))
  f.create()
  assert.deepEqual(f.files('system').map(file => basename(file)), ['2026-11-07.system.txt', '2026-11-08.system.txt'])
  assert.equal(f.files('business').length, 0)
})

test('active task keeps one file and refreshes retention over multiple days', t => {
  const f = fixture(t), store = f.create()
  for (let day = 6; day <= 12; day++) {
    f.setDate(new Date(2026, 10, day))
    f.write(store, 'business', 'day-' + day, 'active')
    assert.equal(f.files('business').length, 1)
  }
  const content = readFileSync(f.files('business')[0]!, 'utf8')
  assert.ok(content.includes('day-6') && content.includes('day-12'))
})

test('legacy files remain discoverable and expired files are cleaned without touching unrelated files', t => {
  const f = fixture(t)
  writeFileSync(join(f.directory, '2026-11-05.log'), 'keep')
  writeFileSync(join(f.directory, '2026-11-04.old.log'), 'keep')
  writeFileSync(join(f.directory, '2026-11-03.system.old-run.000001.txt'), 'expired')
  writeFileSync(join(f.directory, '2026-11-04.business.old-run.000002.txt'), 'expired')
  writeFileSync(join(f.directory, 'notes.txt'), 'unrelated')
  mkdirSync(join(f.directory, '2026-11-01.system.txt'))
  f.create()
  assert.equal(listLogFiles(f.directory).length, 2)
  assert.equal(readFileSync(join(f.directory, 'notes.txt'), 'utf8'), 'unrelated')
})

test('task IDs cannot escape the directory or collide through filename sanitization', t => {
  const f = fixture(t), store = f.create()
  assert.equal(store.write('business', 'slash', '../a'), true)
  assert.equal(store.write('business', 'backslash', '..\\a'), true)
  assert.equal(f.files('business').length, 2)
  assert.ok(f.files('business').every(file => /^business\.[a-f0-9]{64}\.txt$/.test(basename(file))))
})

test('messages without a task ID use the daily system file', t => {
  const f = fixture(t), store = f.create()
  f.write(store, 'business', 'unscoped')
  f.write(store, 'system', 'system')
  assert.equal(f.files('business').length, 0)
  assert.equal(f.files('system').length, 1)
  assert.equal(readFileSync(f.files('system')[0]!, 'utf8'), 'unscoped\nsystem\n')
})

test('unavailable files cannot throw into business callers', t => {
  const f = fixture(t), store = f.create()
  mkdirSync(join(f.directory, '2026-11-06.system.txt'))
  assert.equal(store.write('system', 'blocked'), false)
  assert.equal(f.errors.length, 1)
  assert.equal(store.write('business', 'continues', 'task-a'), true)
})

test('retention configuration and file discovery validate their inputs', t => {
  const f = fixture(t)
  assert.throws(() => new LogFileStore(f.directory, { system: { retentionDays: 0 }, business: { retentionDays: 2 } }), /配置无效/)
  assert.equal(logFileInfo('arbitrary.txt'), undefined)
  assert.deepEqual(logFileInfo('2026-11-06.system.txt'), { date: '2026-11-06', category: 'system' })
  assert.deepEqual(logFileInfo('business.task-a.txt'), { category: 'business' })
  assert.equal(localLogDate(new Date(2026, 10, 6, 23, 59)), '2026-11-06')
  assert.deepEqual(readdirSync(f.directory), [])
})
