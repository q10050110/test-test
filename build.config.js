/**
 * Electron Builder 配置文件 (ESM)
 * 可以使用 import/export 和注释
 */

export default {
  // 国内镜像资源
  electronDownload: {
    "mirror": "https://npmmirror.com/mirrors/electron/"
  },
  // 应用唯一标识
  appId: "com.example.myapp",

  // 应用名称（安装包和桌面图标显示）
  productName: "bang",

  // 输出目录
  directories: {
    output: "release",        // 打包输出目录
    buildResources: "build"   // 构建资源目录（图标、安装包模板等）
  },
  asar: true,
  // 文件排除规则
  files: [
    "dist-electron/**/*",   // Electron 主进程编译后的文件
    "electron/preload.js",  // preload 脚本
    "dist/**/*",            // 打包前端构建文件
    "node_modules/**/*",
    "!**/*.map"             // 排除 source map
  ],

  // Windows 配置
  win: {
    target: [
      "nsis",  // 使用 NSIS 制作安装程序
    ],
    icon: "build/icons/win/icon.ico", // Windows 图标
    legalTrademarks: "MyCompany",
    requestedExecutionLevel: "asInvoker" // requireAdministrator管理员权限运行
  },

  // NSIS 安装器配置
  nsis: {
    oneClick: false,          // 允许用户选择安装路径
    allowElevation: true,     // 允许权限提升
    allowToChangeInstallationDirectory: true, // 可修改安装目录
    createDesktopShortcut: true,  // 创建桌面快捷方式
    createStartMenuShortcut: true, // 创建开始菜单快捷方式
    shortcutName: "上品帮-自动化助手"  // 快捷方式名称
  },

  // macOS 配置
  mac: {
    target: ["dmg", "zip"],   // DMG 和 ZIP 格式
    icon: "build/icons/mac/icon.icns", // mac 图标
    category: "public.app-category.utilities"
  },

  // Linux 配置
  linux: {
    target: ["AppImage", "deb", "rpm"], // 打包格式
    icon: "build/icons/png",             // png 图标文件夹
    category: "Utility"
  },

  // 发布配置
  publish: [
    {
      provider: "generic",
      url: 'https://test-plus.shopbang.cn/version/'
    }
  ],

  // 打包后钩子，可执行自定义逻辑
  afterPack: async (context) => {
    console.log("打包完成，afterPack 钩子执行", context.appOutDir);
  }
}
