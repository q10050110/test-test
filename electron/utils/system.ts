import { app, dialog, shell, clipboard, nativeImage, screen, powerMonitor, systemPreferences, Notification, Tray, Menu, BrowserWindow } from 'electron'
import { join, dirname } from 'path'
import { existsSync, readFileSync, writeFileSync, mkdirSync, statSync } from 'fs'

/**
 * Electron 系统级能力封装
 */
export class SysTemUtils {
  /**
   * 获取应用相关信息
   */
  static getAppInfo() {
    return {
      name: app.getName(),
      version: app.getVersion(),
      path: app.getAppPath(),
      userDataPath: app.getPath('userData'),
      homePath: app.getPath('home'),
      tempDirectory: app.getPath('temp'),
    }
  }

  /**
   * 获取系统信息
   */
  static getSystemInfo() {
    return {
      platform: process.platform,
      arch: process.arch,
      versions: process.versions
    }
  }

  /**
  * 文件操作
  */
  static fileOperations = {
    /**
     * 读取文件
     * @param filePath 文件路径
     */
    readFile: (filePath: string): Buffer | null => {
      try {
        if (existsSync(filePath)) {
          return readFileSync(filePath)
        }
        return null
      } catch (error) {
        return null
      }
    },
    /**
     * 写入文件
     * @param filePath 文件路径
     * @param data 文件内容
     */
    writeFile: (filePath: string, data: string | Buffer): boolean => {
      try {
        const dir = dirname(filePath)
        if (!existsSync(dir)) {
          mkdirSync(dir, { recursive: true })
        }
        writeFileSync(filePath, data)
        return true
      } catch (error) {
        console.error('写入文件失败！', error)
        return false
      }
    },
    /**
   * 检查文件是否存在
   */
    exists: (filePath: string): boolean => {
      return existsSync(filePath)
    },
    /**
     * 获取文件信息
     * @param filePath 文件路径
     */
    getFileInfo: (filePath: string) => {
      try {
        if (existsSync(filePath)) {
          return statSync(filePath)
        }
        return null
      } catch (error) {
        console.error('获取文件信息失败：', error)
        return null
      }
    }
  }
  /**
  * 对话框操作
  */
  static dialogOperations = {
    /**
     * 显示消息框
     * @param message 消息内容
     * @param title 标题
     */
    showInfoDialog: async (title: string, message: string) => {
      return await dialog.showMessageBox({
        type: 'info',
        title,
        message,
        buttons: ['确定']
      })
    },
    /**
  * 显示确认对话框
  */
    showConfirmDialog: async (title: string, message: string): Promise<boolean> => {
      const result = await dialog.showMessageBox({
        type: 'question',
        title,
        message,
        buttons: ['确定', '取消'],
        defaultId: 0, // 默认选中第一个按钮
        cancelId: 1   // 点击 ESC 或关闭按钮时，相当于点击第二个按钮
      })

      // 返回 true 表示点击了"确定"，false 表示点击了"取消"或关闭按钮
      return result.response === 0
    },
    /**
     * 选择文件
     */
    selectFile: async (options?: Electron.OpenDialogOptions) => {
      const defaultOptions: Electron.OpenDialogOptions = {
        properties: ['openFile'],
        filters: [{
          name: 'All Files',
          extensions: ['*']
        }]
      }

      const result = await dialog.showOpenDialog({ ...defaultOptions, ...options })
      return result.filePaths
    },
    /**
    * 选择保存路径
    */
    selectSavePath: async (options?: Electron.SaveDialogOptions) => {
      const result = await dialog.showSaveDialog(options || {})
      return result.filePath
    }
  }
  /**
  * 剪贴板操作
  */
  static clipboardOperations = {
    /**
     * 写入文本到剪贴板
     */
    writeText: (text: string) => {
      clipboard.writeText(text)
    },

    /**
     * 从剪贴板读取文本
     */
    readText: (): string => {
      return clipboard.readText()
    },

    /**
     * 写入HTML到剪贴板
     */
    writeHTML: (html: string) => {
      clipboard.writeHTML(html)
    },

    /**
     * 从剪贴板读取HTML
     */
    readHTML: (): string => {
      return clipboard.readHTML()
    },

    /**
     * 写入图像到剪贴板
     */
    writeImage: (img: Electron.NativeImage) => {
      clipboard.writeImage(img)
    },

    /**
     * 从剪贴板读取图像
     */
    readImage: (): Electron.NativeImage => {
      return clipboard.readImage()
    }
  }
  /**
     * 屏幕操作
     */
  static screenOperations = {
    /**
     * 获取屏幕尺寸
     */
    getScreenSize: () => {
      const primaryDisplay = screen.getPrimaryDisplay();
      return primaryDisplay.size
    },

    /**
     * 获取所有显示器信息
     */
    getAllDisplays: () => {
      return screen.getAllDisplays()
    },

    /**
     * 获取主显示器
     */
    getPrimaryDisplay: () => {
      return screen.getPrimaryDisplay()
    },

    /**
     * 监听显示设置变化
     */
    onDisplayChanged: (callback: () => void) => {
      screen.on('display-metrics-changed', callback)
      return () => screen.removeListener('display-metrics-changed', callback)
    }
  }
  /**
 * 电源监控
 */
  static powerOperations = {
    /**
     * 监听系统挂起
     */
    onSuspend: (callback: () => void) => {
      powerMonitor.on('suspend', callback);
      return () => powerMonitor.removeListener('suspend', callback);
    },

    /**
     * 监听系统恢复
     */
    onResume: (callback: () => void) => {
      powerMonitor.on('resume', callback);
      return () => powerMonitor.removeListener('resume', callback);
    },

    /**
     * 监听关机
     */
    onShutdown: (callback: () => void) => {
      powerMonitor.on('shutdown', callback)
      return () => powerMonitor.removeListener('shutdown', callback)
    },

    /**
     * 检查是否正在充电
     */
    isCharging: (): boolean => {
      return !powerMonitor.isOnBatteryPower();
    }
  }
  /**
 * 系统通知
 */
  static notificationOperations = {
    /**
     * 显示通知
     */
    showNotification: (options: Electron.NotificationConstructorOptions) => {
      if (Notification.isSupported()) {
        const notification = new Notification(options);
        notification.show();
        return notification;
      } else {
        console.warn('系统不支持通知');
        return null;
      }
    }
  };
  /**
  * 系统托盘
  */
  static trayOperations = {
    /**
     * 创建系统托盘
     */
    createTray: (
      iconPath: string,
      tooltip: string,
      menuItems?: Array<{ label: string, click: () => void }>
    ) => {
      const tray = new Tray(iconPath);
      tray.setToolTip(tooltip);

      if (menuItems && menuItems.length > 0) {
        const contextMenu = Menu.buildFromTemplate(
          menuItems.map(item => ({
            label: item.label,
            click: item.click
          }))
        );
        tray.setContextMenu(contextMenu);
      }

      return tray;
    }
  };
  /**
   * 外部链接操作
   */
  static externalOperations = {
    /**
     * 打开外部链接
     */
    openExternal: async (url: string) => {
      try {
        await shell.openExternal(url);
        return true;
      } catch (error) {
        console.error('打开外部链接失败:', error);
        return false;
      }
    },

    /**
     * 打开路径
     */
    openPath: async (path: string) => {
      try {
        await shell.openPath(path);
        return true;
      } catch (error) {
        console.error('打开路径失败:', error);
        return false;
      }
    },

    /**
     * 在文件管理器中显示文件
     */
    showItemInFolder: (fullPath: string) => {
      shell.showItemInFolder(fullPath);
    }
  };
  /**
  * 应用控制
  */
  static appOperations = {
    /**
     * 退出应用
     */
    quit: () => {
      app.quit();
    },

    /**
     * 重启应用
     */
    relaunch: () => {
      app.relaunch();
      app.exit(0);
    },

    /**
     * 最小化到托盘（模拟）
     */
    minimizeToTray: (win: BrowserWindow) => {
      // 这里可以结合托盘功能实现最小化到托盘
      win.minimize()
    },
    /**
    * 最大化
    */
    maximize: (win: BrowserWindow) => {
      win.maximize()
    },
    /**
    * 还原
    */
    unmaximize: (win: BrowserWindow) => {
      win.unmaximize()
    },
  };
}