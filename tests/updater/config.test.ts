import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { getConfig, validateConfiguration } = require('app-builder-lib/out/util/config/config.js')

test('实际打包配置符合当前 electron-builder schema，默认入口与显式入口一致', async () => {
  const config = await getConfig(process.cwd(), 'build.config.js')
  await validateConfiguration(config)
  const defaultConfig = await getConfig(process.cwd())
  const legacyConfig = await getConfig(process.cwd(), 'electron-builder.jsonc')
  assert.deepEqual(defaultConfig.mac, config.mac)
  assert.deepEqual(legacyConfig.mac, config.mac)
  assert.equal(config.mac.forceCodeSigning, true)
  assert.equal(config.mac.notarize, true)
  assert.deepEqual(config.mac.target, [
    { target: 'dmg', arch: ['x64', 'arm64'] },
    { target: 'zip', arch: ['x64', 'arm64'] },
  ])
  assert.ok(config.files.some((rule: any) => rule.filter?.includes('dist-electron/**/*')))
})

test('mac 缺少公证凭据时构建失败，Windows 构建不受影响', async (t) => {
  const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')!
  t.after(() => Object.defineProperty(process, 'platform', originalPlatform))
  const names = [
    'APPLE_ID',
    'APPLE_APP_SPECIFIC_PASSWORD',
    'APPLE_TEAM_ID',
    'APPLE_API_KEY',
    'APPLE_API_KEY_ID',
    'APPLE_API_ISSUER',
    'APPLE_KEYCHAIN_PROFILE',
  ]
  const previous = names.map((name) => process.env[name])
  names.forEach((name) => delete process.env[name])
  t.after(() =>
    names.forEach((name, index) => {
      if (previous[index] === undefined) delete process.env[name]
      else process.env[name] = previous[index]
    }),
  )
  const config = await getConfig(process.cwd(), 'build.config.js')
  Object.defineProperty(process, 'platform', { ...originalPlatform, value: 'win32' })
  await assert.rejects(config.beforePack({ electronPlatformName: 'darwin' }), /macOS 主机/)
  Object.defineProperty(process, 'platform', { ...originalPlatform, value: 'darwin' })
  await assert.rejects(config.beforePack({ electronPlatformName: 'darwin' }), /公证凭据/)
  await assert.doesNotReject(config.beforePack({ electronPlatformName: 'win32' }))
  process.env.APPLE_ID = 'test@example.com'
  process.env.APPLE_APP_SPECIFIC_PASSWORD = 'test-password'
  await assert.rejects(config.beforePack({ electronPlatformName: 'darwin' }), /公证凭据/)
  process.env.APPLE_TEAM_ID = 'TESTTEAM'
  await assert.doesNotReject(config.beforePack({ electronPlatformName: 'darwin' }))
})
