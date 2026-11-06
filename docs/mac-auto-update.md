# macOS 打包与自动更新

实际配置是 `build.config.js`。`package.json` 的 `build.extends` 和兼容入口
`electron-builder.jsonc` 都指向它；打包脚本及 CI 也显式指定此配置。

## 签名和公证

必须在 macOS 上构建，安装 Xcode Command Line Tools，并准备带私钥的
**Developer ID Application** 证书。当前版本与更新版本需要保持应用标识及签名身份兼容，
不要在发布途中改变 `appId`、开发团队或应用名称。

GitHub Actions 的 `Build signed macOS updates` 工作流需要以下 Repository Secrets：

| Secret                        | 内容                                       |
| ----------------------------- | ------------------------------------------ |
| `MAC_CSC_LINK`                | 导出为 `.p12` 的证书和私钥，以 Base64 编码 |
| `MAC_CSC_KEY_PASSWORD`        | `.p12` 的导出密码                          |
| `APPLE_ID`                    | Apple 开发者账号                           |
| `APPLE_APP_SPECIFIC_PASSWORD` | Apple 账号生成的应用专用密码               |
| `APPLE_TEAM_ID`               | 证书所属开发团队 ID                        |

本地构建可将已导入钥匙串的证书交给 electron-builder 自动选择，或设置
`CSC_LINK`（`.p12` 路径/Base64）和 `CSC_KEY_PASSWORD`。公证凭据可以任选一组：

- `APPLE_ID`、`APPLE_APP_SPECIFIC_PASSWORD`、`APPLE_TEAM_ID`；
- `APPLE_API_KEY`（`.p8` 文件路径）、`APPLE_API_KEY_ID`、`APPLE_API_ISSUER`；
- `APPLE_KEYCHAIN_PROFILE`，以及可选的 `APPLE_KEYCHAIN`。

不要把私钥、证书密码或公证密码提交到代码库。`notarize: true` 使用 electron-builder
内置公证流程；缺少凭据会在打包开始时报错。签名后还会拒绝未签名和 ad-hoc 签名产物，
CI 会验证签名、Gatekeeper 和 stapled 公证票据。

本地正式打包：

```sh
yarn build:prod
```

本地测试环境打包：

```sh
yarn build
```

两个命令在 macOS 上均生成 x64、arm64 的 DMG 和 ZIP。测试包也必须签名、公证，
才能测试完整的自动更新安装流程。

## 发布文件

Generic provider 不会自动上传产物。将同一次构建的以下文件上传至对应版本目录：

- `latest-mac.yml`；
- x64 和 arm64 的 `.zip`（自动更新必须使用 ZIP）；
- x64 和 arm64 的 `.dmg`（首次安装和手动升级）；
- 构建生成的 `.blockmap`，并保留旧版本对应文件以支持差分下载。

正式目录为 `https://shopbang.cn/version/`，测试目录为
`https://test-plus.shopbang.cn/version/`。先上传安装文件，最后发布 `latest-mac.yml`。
保持构建生成的文件名、大小和 SHA512 不变，不要重新压缩 ZIP、修改已签名的 `.app`，
也不要用单独架构构建生成的清单覆盖合并后的清单。Windows 的 `latest.yml` 需要独立保留。

服务器需允许匿名 HTTPS 下载清单及文件，正确处理文件名的 URL 编码。
清单应及时刷新，避免 CDN 缓存旧清单；差分下载需要服务器支持 HTTP Range。
清单和包的版本号必须高于已安装版本。

2026-11-06 排查时，正式目录的 `latest-mac.yml` 返回 HTTP 404；测试目录返回
`1.0.27`，只包含 arm64 的 ZIP 和 DMG。测试 ZIP 的 HEAD 请求返回 HTTP 200，
且支持 Range。发布修复版本时需补齐正式清单和双架构文件，并提升 `package.json`
中的版本号；`1.0.27` 的客户端不会把同版本清单识别为更新。

## 客户端行为与验收

macOS 启动检测后自动下载。ZIP 下载完成后还需等待 Squirrel.Mac 解包并验证签名，
成功后才显示“立即安装”。点击安装会先停止任务和清理临时文件，再让更新器关闭应用并重启；
选择稍后安装时，准备好的更新也会在正常退出后安装。Windows 保持原来的手动下载、点击安装流程。

如果旧版本没有有效签名、使用 ad-hoc 签名，或新旧签名身份不兼容，需要先手动安装一次
新的签名 DMG。仅发布一个签名的新包不能让已安装的无签名旧包自动升级。
请将应用拖入 `/Applications` 并从该目录运行，避免从 DMG 或只读目录测试更新。

验收时，在 Intel Mac 和 Apple Silicon Mac 上分别安装一个较低版本的签名、公证包，
发布更高版本后检查：自动下载、签名校验成功后出现安装按钮、点击后退出并重启到新版本，
以及稍后安装后正常退出再启动的版本。错误详情会显示在界面并记录到系统日志。

本地回归测试：`yarn test:updater`。Windows 上的测试模拟 updater 事件，无法代替
macOS 真机的 codesign、公证、Gatekeeper 和 Squirrel 安装验收。

参考：[Electron macOS 自动更新签名要求](https://www.electronjs.org/docs/latest/api/auto-updater#macos)。
