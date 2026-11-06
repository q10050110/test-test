import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { registerHooks } from 'node:module'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test('更新生命周期：下载、原生签名校验、失败恢复和安装清理', async (t) => {
  const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')!
  const updater = new EventEmitter() as EventEmitter & Record<string, any>
  const nativeUpdater = new EventEmitter()
  const values = new Map<string, any>()
  const messages: { channel: string; payload: any }[] = []
  const logger = { info() {}, warn() {}, error() {} }
  const prefix = join(tmpdir(), 'shopbang-updater-')
  const directory = mkdtempSync(prefix)
  ;(globalThis as any).__updateTest = {
    app: { isPackaged: true, getAppPath: () => directory },
    updater,
    nativeUpdater,
    logger,
    operationStore: {
      get: (key: string) => values.get(key),
      set: (key: string, value: any) => values.set(key, value),
    },
  }
  const sources: Record<string, string> = {
    electron:
      'export const app = globalThis.__updateTest.app; export const autoUpdater = globalThis.__updateTest.nativeUpdater; export class BrowserWindow {}',
    'electron-updater': 'export default { autoUpdater: globalThis.__updateTest.updater }',
    '../log/index.js': 'export default globalThis.__updateTest.logger',
    '../store/index.js': 'export const operationStore = globalThis.__updateTest.operationStore',
  }
  const hook = registerHooks({
    resolve(specifier, context, next) {
      if (sources[specifier]) return { url: `updater-test:${specifier}`, shortCircuit: true }
      return next(specifier, context)
    },
    load(url, context, next) {
      if (url.startsWith('updater-test:'))
        return { format: 'module', source: sources[url.slice(13)], shortCircuit: true }
      return next(url, context)
    },
  })
  t.after(() => {
    hook.deregister()
    Object.defineProperty(process, 'platform', originalPlatform)
    assert.ok(directory.startsWith(prefix))
    rmSync(directory, { recursive: true, force: true })
    delete (globalThis as any).__updateTest
  })
  const { UpdaterManager } = await import('../../electron/services/update.services.js')
  const info = {
    version: '2.0.0',
    releaseDate: '2026-11-06',
    files: [
      { url: 'app-arm64.dmg', size: 1000 },
      { url: `app-${process.arch}.zip`, size: 500 },
    ],
  }
  function setup(platform: string, manual = false) {
    writeFileSync(
      join(directory, 'package.json'),
      JSON.stringify(manual ? { MAC_UPDATE_MODE: 'manual' } : {}),
    )
    Object.defineProperty(process, 'platform', { ...originalPlatform, value: platform })
    updater.removeAllListeners()
    nativeUpdater.removeAllListeners()
    values.clear()
    messages.length = 0
    ;(UpdaterManager as any).instance = null
    const manager = UpdaterManager.getInstance()
    manager.setMainWindow({
      isDestroyed: () => false,
      webContents: { send: (channel: string, payload: any) => messages.push({ channel, payload }) },
    } as any)
    return manager
  }

  await t.test('手动分发包清除旧更新状态，所有更新入口均不触发网络或安装', async () => {
    const manager = setup('darwin', true)
    values.set('update-status', 'downloaded')
    let calls = 0
    updater.checkForUpdates = async () => {
      calls++
      throw new Error('不应检测更新')
    }
    updater.downloadUpdate = async () => {
      calls++
      throw new Error('不应下载更新')
    }
    updater.quitAndInstall = () => {
      calls++
    }
    manager.init()
    await manager.checkUpdate()
    await manager.checkForUpdatesAndNotify()
    await manager.startDownload()
    await manager.quitAndInstall()
    assert.equal(calls, 0)
    assert.equal(updater.autoDownload, false)
    assert.equal(updater.autoInstallOnAppQuit, false)
    assert.equal(updater.listenerCount('update-available'), 0)
    assert.equal(nativeUpdater.listenerCount('update-downloaded'), 0)
    assert.equal(values.get('update-status'), 'hasNew')
    assert.deepEqual(messages, [])
  })

  await t.test('mac 自动下载，只有 Squirrel 验签成功后才允许安装，安装不重复下载', async () => {
    const manager = setup('darwin')
    values.set('update-status', 'downloaded')
    manager.init()
    manager.init()
    assert.equal(values.get('update-status'), 'hasNew')
    assert.equal(updater.autoDownload, true)
    assert.equal(updater.autoInstallOnAppQuit, true)
    assert.equal(updater.listenerCount('update-available'), 1)
    let downloads = 0
    updater.checkForUpdates = async () => {
      updater.emit('update-available', info)
      return { isUpdateAvailable: true, downloadPromise: Promise.resolve([]) }
    }
    updater.downloadUpdate = async () => {
      downloads++
      return []
    }
    await manager.checkUpdate()
    assert.equal(values.get('update-status'), 'download')
    assert.equal(values.get('update-info').size, 500)
    updater.emit('update-downloaded')
    assert.equal(
      messages.some((m) => m.channel === 'update-downloaded'),
      false,
    )
    nativeUpdater.emit('update-downloaded')
    assert.equal(values.get('update-status'), 'downloaded')

    const order: string[] = []
    let finishCleanup!: () => void
    manager.setBeforeInstall(async () => {
      order.push('cleanup')
      await new Promise<void>((resolve) => {
        finishCleanup = resolve
      })
      order.push('cleaned')
    })
    updater.quitAndInstall = () => order.push('install')
    const installing = manager.quitAndInstall()
    assert.equal(manager.isInstalling, true)
    assert.deepEqual(order, ['cleanup'])
    await manager.quitAndInstall()
    finishCleanup()
    await installing
    assert.deepEqual(order, ['cleanup', 'cleaned', 'install'])
    assert.equal(downloads, 0)
  })

  await t.test('签名失败不会进入可安装状态，错误消息能传到界面', async () => {
    const manager = setup('darwin')
    manager.init()
    updater.emit('update-available', info)
    updater.emit('update-downloaded')
    updater.emit('error', new Error('Code signature did not pass validation'))
    assert.equal(values.get('update-status'), 'hasUpdate')
    assert.equal(messages.at(-1)?.payload.message, 'Code signature did not pass validation')
    let installed = false
    updater.quitAndInstall = () => {
      installed = true
    }
    await manager.quitAndInstall()
    assert.equal(installed, false)
    assert.equal(manager.isInstalling, false)
  })

  await t.test('处理独立的自动下载 Promise 拒绝', async () => {
    const manager = setup('darwin')
    manager.init()
    updater.checkForUpdates = async () => ({
      downloadPromise: Promise.resolve().then(() => {
        const error = new Error('network disconnected')
        updater.emit('error', error)
        throw error
      }),
    })
    await assert.doesNotReject(manager.checkUpdate())
    assert.equal(messages.at(-1)?.payload.message, 'network disconnected')
  })

  await t.test('清理失败恢复状态，并阻止安装', async () => {
    const manager = setup('darwin')
    manager.init()
    updater.emit('update-available', info)
    nativeUpdater.emit('update-downloaded')
    manager.setBeforeInstall(async () => {
      throw new Error('cleanup failed')
    })
    let installed = false
    updater.quitAndInstall = () => {
      installed = true
    }
    await manager.quitAndInstall()
    assert.equal(installed, false)
    assert.equal(manager.isInstalling, false)
    assert.equal(values.get('update-status'), 'hasUpdate')
  })

  await t.test('Windows 保持手动下载，重启后的下载会先检测更新并消费网络错误', async () => {
    const manager = setup('win32')
    manager.init()
    assert.equal(updater.autoDownload, false)
    assert.equal(updater.autoInstallOnAppQuit, false)
    const calls: string[] = []
    updater.checkForUpdates = async () => {
      calls.push('check')
      updater.emit('update-available', info)
      return { isUpdateAvailable: true, downloadPromise: null }
    }
    updater.downloadUpdate = async () => {
      calls.push('download')
      const error = new Error('download failed')
      updater.emit('error', error)
      throw error
    }
    await assert.doesNotReject(manager.startDownload())
    assert.deepEqual(calls, ['check', 'download'])
    assert.equal(values.get('update-status'), 'hasUpdate')
    updater.emit('update-downloaded')
    assert.equal(values.get('update-status'), 'downloaded')
    updater.emit('update-not-available')
    assert.equal(values.get('update-status'), 'hasNew')
  })
})
