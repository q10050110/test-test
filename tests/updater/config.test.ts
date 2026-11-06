import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { getConfig, validateConfiguration } = require('app-builder-lib/out/util/config/config.js')
const {
  getAppUpdatePublishConfiguration,
} = require('app-builder-lib/out/publish/PublishManager.js')

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

test('手动分发模式无需公证凭据，不生成自动更新配置，签名配置保持独立', async (t) => {
  const config = await getConfig(process.cwd(), 'build.mac-unsigned.config.js')
  await validateConfiguration(config)
  assert.equal(config.mac.identity, '-')
  assert.equal(config.mac.forceCodeSigning, false)
  assert.equal(config.mac.notarize, false)
  assert.equal(config.afterSign, null)
  assert.equal(config.extraMetadata.MAC_UPDATE_MODE, 'manual')
  assert.equal(config.directories.output, 'release/mac-unsigned')
  assert.ok(config.mac.artifactName.includes('-unsigned-'))
  // 使用 builder 的真实解析流程，即使 CI 有仓库信息也不能自动推断更新源。
  assert.equal(
    await getAppUpdatePublishConfiguration(
      {
        config,
        platformSpecificBuildOptions: config.mac,
        info: { config },
      },
      null,
      null,
      false,
    ),
    null,
  )

  const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')!
  const previousAppleId = process.env.APPLE_ID
  t.after(() => {
    Object.defineProperty(process, 'platform', originalPlatform)
    if (previousAppleId === undefined) delete process.env.APPLE_ID
    else process.env.APPLE_ID = previousAppleId
  })
  delete process.env.APPLE_ID
  Object.defineProperty(process, 'platform', { ...originalPlatform, value: 'darwin' })
  await assert.doesNotReject(config.beforePack({ electronPlatformName: 'darwin' }))
  await assert.rejects(config.beforePack({ electronPlatformName: 'win32' }), /仅用于/)

  const signed = await getConfig(process.cwd(), 'build.config.js')
  assert.equal(signed.mac.forceCodeSigning, true)
  assert.equal(signed.mac.notarize, true)
  assert.equal(signed.extraMetadata.MAC_UPDATE_MODE, undefined)
  assert.notEqual(signed.publish, null)
})
