/**
 * Electron 预加载脚本 (Preload Script)
 * 在渲染进程加载前执行，用于安全地暴露 Node.js API 给渲染进程
 */
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  /**
   * 发送消息到主进程
   * @param {string} channel - 频道名称
   * @param {any} data - 数据
   */
  sendMessage: (channel, data) => {
    ipcRenderer.send(channel, data)
  },

  /**
   * 监听主进程消息
   * @param {string} channel - 频道名称
   * @param {Function} callback - 回调函数
   */
  onMessage: (channel, callback) => {
    ipcRenderer.on(channel, (event, data) => callback(data))
  },

  /**
   * 移除消息监听器
   * @param {string} channel - 频道名称
   */
  removeListener: (channel) => {
    ipcRenderer.removeListener(channel)
  },

  /**
   * 调用主进程方法并等待返回
   * @param {string} channel - 频道名称
   * @param {any} data - 数据
   * @returns {Promise<any>}
   */
  invoke: (channel, data) => {
    return ipcRenderer.invoke(channel, data)
  },

  /**
   * 注册长连接事件监听
   * @param {string} channel - 频道名称
   * @param {Function} callback - 当主进程通过该频道发送消息时调用
   * 注意：事件会持续监听，直到调用 off 移除
   */
  on: (channel, callback) => {
    ipcRenderer.on(channel, (event, data) => callback(data))
  },

  /**
   * 移除长连接事件监听
   * @param {string} channel - 频道名称
   * @param {Function} callback - 对应的回调函数
   * 注意：必须传入注册时的同一个回调函数才能正确移除
   */
  off: (channel, callback) => {
    ipcRenderer.off(channel, callback)
  }
})

contextBridge.exposeInMainWorld('electronStore', {
  get: (key) => ipcRenderer.invoke('store-get', key),
  set: (key, value) => ipcRenderer.invoke('store-set', key, value),
  delete: (key) => ipcRenderer.invoke('store-delete', key)
})

// 日志 API
contextBridge.exposeInMainWorld('electronLog', {
  info: (...args) => ipcRenderer.invoke('log-info', args),
  warn: (...args) => ipcRenderer.invoke('log-warn', args),
  error: (...args) => ipcRenderer.invoke('log-error', args),
  debug: (...args) => ipcRenderer.invoke('log-debug', args)
})

console.log('Preload Script Loaded Successfully')
