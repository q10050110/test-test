import config from './build.config.js'

// 无需 Apple 证书的手动分发包；Apple Silicon 使用本机 ad-hoc 签名。
export default {
  ...config,
  extraMetadata: {
    ...config.extraMetadata,
    MAC_UPDATE_MODE: 'manual',
  },
  directories: {
    ...config.directories,
    output: 'release/mac-unsigned',
  },
  mac: {
    ...config.mac,
    artifactName: '${productName}-${version}-unsigned-${arch}.${ext}',
    identity: '-',
    forceCodeSigning: false,
    hardenedRuntime: false,
    notarize: false,
  },
  // 不生成自动更新配置和清单，避免手动分发包进入正式更新链路。
  publish: null,
  beforePack: async (context) => {
    if (context.electronPlatformName !== 'darwin' || process.platform !== 'darwin') {
      throw new Error('此配置仅用于在 macOS 主机上构建 macOS 手动分发包。')
    }
  },
  afterSign: null,
}
