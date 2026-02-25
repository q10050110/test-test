// electron/utils/broadcast-ipc.ts
import { BrowserWindow, ipcMain, IpcMainEvent } from 'electron'
import { EventEmitter } from 'events'

export class GlobalBroadcastIPC {
  private static instance: GlobalBroadcastIPC
  private windows: Set<BrowserWindow> = new Set()
  private emitter: EventEmitter = new EventEmitter()

  private constructor() {}

  public static getInstance(): GlobalBroadcastIPC {
    if (!GlobalBroadcastIPC.instance) {
      GlobalBroadcastIPC.instance = new GlobalBroadcastIPC()
    }
    return GlobalBroadcastIPC.instance
  }

  // 注册窗口
  public registerWindow(window: BrowserWindow): void {
    this.windows.add(window)

    // 窗口关闭时自动移除
    window.on('closed', () => {
      this.windows.delete(window)
    })
  }

  // 移除窗口
  public unregisterWindow(window: BrowserWindow): void {
    this.windows.delete(window)
  }

  // 广播消息给所有窗口
  public broadcast(channel: string, ...args: any[]): void {
    for (const window of this.windows) {
      if (!window.isDestroyed()) {
        window.webContents.send(channel, ...args)
      }
    }
  }

  // 发送给指定窗口类型（如 'main', 'settings' 等）
  public broadcastToType(windowType: string, channel: string, ...args: any[]): void {
    for (const window of this.windows) {
      if (!window.isDestroyed() && (window as any).windowType === windowType) {
        window.webContents.send(channel, ...args)
      }
    }
  }

  // 发送给除了指定窗口外的所有窗口
  public broadcastExcept(exceptWindow: BrowserWindow, channel: string, ...args: any[]): void {
    for (const window of this.windows) {
      if (window !== exceptWindow && !window.isDestroyed()) {
        window.webContents.send(channel, ...args)
      }
    }
  }

  // 监听来自渲染进程的消息并转发给所有窗口
  public listen(channel: string, callback?: (event: IpcMainEvent, ...args: any[]) => void): void {
    ipcMain.removeAllListeners(channel)
    ipcMain.on(channel, (event, ...args) => {
      // 转发给所有其他窗口
      for (const window of this.windows) {
        if (window.webContents !== event.sender && !window.isDestroyed()) {
          window.webContents.send(channel, ...args)
        }
      }

      // 执行自定义回调
      if (callback) {
        callback(event, ...args)
      }
    })
  }

  // 移除监听器
  public removeListener(channel: string): void {
    ipcMain.removeAllListeners(channel)
  }

  // 获取窗口数量
  public getWindowCount(): number {
    return this.windows.size
  }

  // 获取所有窗口
  public getWindows(): BrowserWindow[] {
    return Array.from(this.windows)
  }
}

export const globalBroadcast = GlobalBroadcastIPC.getInstance()
