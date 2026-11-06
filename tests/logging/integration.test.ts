import { test } from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { listLogFiles, localLogDate } from '../../electron/log/file-store.js'

test('real electron-log routes categories, records errors once and exports all new and legacy files', async (t) => {
  const prefix = join(tmpdir(), 'shopbang-log-integration-')
  const directory = mkdtempSync(prefix)
  const handlers = new Map<string, (...args: any[]) => void>()
  ;(globalThis as any).__logElectron = {
    app: { getPath: () => directory, getVersion: () => 'test', isPackaged: false },
    ipcMain: {
      handle: (name: string, handler: (...args: any[]) => void) => handlers.set(name, handler),
    },
  }
  const hook = registerHooks({
    resolve(specifier, context, next) {
      if (specifier === 'electron') return { url: 'logging-test:electron', shortCircuit: true }
      return next(specifier, context)
    },
    load(url, context, next) {
      if (url === 'logging-test:electron')
        return {
          format: 'module',
          shortCircuit: true,
          source: `export const { app, ipcMain } = globalThis.__logElectron;
          export const dialog = {}, shell = {}, clipboard = {}, nativeImage = {}, screen = {},
          powerMonitor = {}, systemPreferences = {}, Menu = {};
          export class Notification {} export class Tray {} export class BrowserWindow {}`,
        }
      return next(url, context)
    },
  })
  t.after(() => {
    hook.deregister()
    assert.ok(directory.startsWith(prefix))
    rmSync(directory, { recursive: true, force: true })
    delete (globalThis as any).__logElectron
  })

  const { default: log, initLogger } = await import('../../electron/log/index.js')
  const { default: businessLog } = await import('../../electron/log/business.js')
  const { SysTemUtils } = await import('../../electron/utils/system.js')
  const { registerLogIpc } = await import('../../electron/ipc/log.ipc.js')
  const originalConsole = log.transports.console.writeFn
  log.transports.console.writeFn = () => {}
  t.after(() => {
    log.errorHandler.stopCatching()
    log.transports.console.writeFn = originalConsole
  })

  const rejectionsBefore = process.listenerCount('unhandledRejection')
  const exceptionsBefore = process.listenerCount('uncaughtException')
  initLogger()
  initLogger()
  assert.equal(process.listenerCount('unhandledRejection'), rejectionsBefore + 1)
  assert.equal(process.listenerCount('uncaughtException'), exceptionsBefore + 1)
  assert.equal(log.transports.file.level, false)
  log.info('system-marker')
  businessLog.info('business-marker', { taskId: 'task-1', phase: 'collecting' })
  businessLog.error('business-error', new Error('stack-marker'))
  log.debug('debug-not-in-file')
  ;(log.errorHandler as any).handleError(new Error('uncaught-marker'))
  registerLogIpc()
  handlers.get('log-info')!({}, ['renderer-marker'])

  const logDirectory = join(directory, 'logs')
  const files = listLogFiles(logDirectory)
  const system = files
    .filter((path) => path.includes('.system.'))
    .map((path) => readFileSync(path, 'utf8'))
    .join('')
  const business = files
    .filter((path) => path.includes('.business.'))
    .map((path) => readFileSync(path, 'utf8'))
    .join('')
  assert.ok(system.includes('system-marker'))
  assert.ok(system.includes('[renderer]'))
  assert.ok(system.includes('renderer-marker'))
  assert.equal(system.includes('business-marker'), false)
  assert.equal(system.match(/Error: uncaught-marker/g)?.length, 1)
  assert.ok(business.includes('business-marker'))
  assert.ok(business.includes("taskId: 'task-1'"))
  assert.ok(business.includes('Error: stack-marker'))
  assert.ok(business.includes('integration.test.ts:'))
  assert.equal(business.includes('system-marker'), false)
  assert.equal(system.includes('debug-not-in-file'), false)

  const today = localLogDate(new Date())
  writeFileSync(join(logDirectory, `${today}.log`), 'legacy')
  writeFileSync(join(logDirectory, `${today}.old.log`), 'legacy archive')
  const expected = listLogFiles(logDirectory)
    .map((path) => basename(path))
    .sort()
  assert.deepEqual(
    SysTemUtils.logOperations
      .getLogFiles()
      .map((path) => basename(path))
      .sort(),
    expected,
  )
  const all = join(directory, 'all'),
    recent = join(directory, 'recent')
  mkdirSync(all)
  mkdirSync(recent)
  assert.equal(await SysTemUtils.logOperations.exportAllLogs(all), true)
  assert.equal(await SysTemUtils.logOperations.exportRecentLogs(1, recent), true)
  for (const target of [all, recent]) {
    const exported = join(target, readdirSync(target)[0]!)
    assert.deepEqual(readdirSync(exported).sort(), expected)
  }
})
