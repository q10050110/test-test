import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import path from 'node:path'

const execFileAsync = promisify(execFile)

/**
 * Electron Builder 配置文件 (ESM)
 * 可以使用 import/export 和注释
 */

export default {
  extraMetadata: {
    APP_ENV: process.env.APP_ENV,
  },
  // 国内镜像资源
  electronDownload: {
    mirror: 'https://npmmirror.com/mirrors/electron/',
  },
  // 应用唯一标识
  appId: process.env.APP_ENV === 'development' ? 'sp.bang.test' : 'sp.bang',

  // 应用名称（安装包和桌面图标显示）
  productName: process.env.APP_ENV === 'development' ? '上品帮-测试' : '上品帮',

  // 输出目录
  directories: {
    output: 'release', // 打包输出目录
    buildResources: 'build', // 构建资源目录（图标、安装包模板等）
  },
  asar: true,
  extraResources: [
    {
      from: 'electron/preloads/opencv.js',
      to: 'preloads/opencv.js',
    },
  ],
  // 文件排除规则
  files: [
    'dist-electron/**/*', // Electron 主进程编译后的文件
    'electron/preload.js', // preload 脚本
    'dist/**/*', // 打包前端构建文件
    '!**/*.map', // 排除 source map
  ],

  // Windows 配置
  win: {
    target: [
      'nsis', // 使用 NSIS 制作安装程序
    ],
    icon: 'build/icons/win/icon.ico', // Windows 图标
    legalTrademarks: 'MyCompany',
    requestedExecutionLevel: 'asInvoker', // requireAdministrator管理员权限运行
  },

  // NSIS 安装器配置
  nsis: {
    oneClick: false, // 允许用户选择安装路径
    allowElevation: true, // 允许权限提升
    allowToChangeInstallationDirectory: true, // 可修改安装目录
    createDesktopShortcut: true, // 创建桌面快捷方式
    createStartMenuShortcut: true, // 创建开始菜单快捷方式
    shortcutName:
      process.env.APP_ENV === 'development' ? '上品帮-自动化助手-测试' : '上品帮-自动化助手', // 快捷方式名称
    perMachine: false, // 只允许当前电脑安装
  },

  // macOS 配置
  mac: {
    // 一次构建两种架构，electron-builder 会合并到同一份 latest-mac.yml。
    target: [
      { target: 'dmg', arch: ['x64', 'arm64'] },
      { target: 'zip', arch: ['x64', 'arm64'] },
    ],
    artifactName: '${productName}-${version}-${arch}.${ext}',
    icon: 'build/icons/mac/icon.icns', // mac 图标
    category: 'public.app-category.utilities',
    type: 'distribution',
    forceCodeSigning: true,
    hardenedRuntime: true,
    entitlements: 'build/entitlements.mac.plist',
    entitlementsInherit: 'build/entitlements.mac.plist',
    notarize: true,
  },

  // Linux 配置
  linux: {
    target: ['AppImage', 'deb', 'rpm'], // 打包格式
    icon: 'build/icons/png', // png 图标文件夹
    category: 'Utility',
  },

  // 发布配置
  publish: [
    {
      provider: 'generic',
      url:
        process.env.APP_ENV === 'development'
          ? 'https://test-plus.shopbang.cn/version/'
          : 'https://shopbang.cn/version/',
    },
  ],

  beforePack: async (context) => {
    if (context.electronPlatformName !== 'darwin') return
    if (process.platform !== 'darwin') {
      throw new Error('macOS 自动更新发布包必须在 macOS 主机上签名、公证和构建。')
    }
    // v26 的 notarize: true 在没有凭据时仍会跳过公证，发布包必须提前检查。
    const env = process.env
    const hasAppleId = env.APPLE_ID && env.APPLE_APP_SPECIFIC_PASSWORD && env.APPLE_TEAM_ID
    const hasApiKey = env.APPLE_API_KEY && env.APPLE_API_KEY_ID && env.APPLE_API_ISSUER
    if (!hasAppleId && !hasApiKey && !env.APPLE_KEYCHAIN_PROFILE) {
      throw new Error(
        'macOS 发布包需要公证凭据：APPLE_ID / APPLE_APP_SPECIFIC_PASSWORD / APPLE_TEAM_ID，' +
          '或 APPLE_API_KEY / APPLE_API_KEY_ID / APPLE_API_ISSUER，或 APPLE_KEYCHAIN_PROFILE。',
      )
    }
  },

  afterSign: async (context) => {
    if (context.electronPlatformName !== 'darwin') return
    const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)
    await execFileAsync('codesign', ['--verify', '--deep', '--strict', '--verbose=2', appPath])
    const { stderr } = await execFileAsync('codesign', ['--display', '--verbose=4', appPath])
    // arm64 在找不到证书时可能退回 ad-hoc 签名；这种包不能用于自动更新。
    if (!/^Authority=Developer ID Application:/m.test(stderr)) {
      throw new Error(
        'macOS 自动更新需要 Developer ID Application 签名，不能发布未签名或 ad-hoc 签名包。',
      )
    }
    if (
      process.env.APPLE_TEAM_ID &&
      !stderr.includes(`TeamIdentifier=${process.env.APPLE_TEAM_ID}\n`)
    ) {
      throw new Error('macOS 签名的 TeamIdentifier 与 APPLE_TEAM_ID 不一致。')
    }
  },

  // 打包后钩子，可执行自定义逻辑
  afterPack: async (context) => {
    console.log('打包完成，afterPack 钩子执行', context.appOutDir)
  },
}
