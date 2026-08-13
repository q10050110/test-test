import type { Inspection, TaskStatus, SaveSellDataParams } from './type'
import { MainWindowService } from './main-window.services.js'
import { updateTaskStatusAPI, batchSaveSellDataAPI, saveSellListDataAPI } from './api.js'
import { BrowserWindow } from 'electron'
import { ParseService } from './parse.services.js'
import log from '../../log/index.js'
import dayjs from 'dayjs'
import { memoryMonitor } from '../memory-monitor.services.js'
export class InspectionServices {
  private inspection: Inspection
  private mainWindowService: MainWindowService
  private parseService: ParseService
  private mainWindow: BrowserWindow | null = null
  private progress = { inspectedCount: 0, followedCount: 0 }
  constructor(inspection: Inspection, window: BrowserWindow) {
    this.mainWindow = window
    this.inspection = inspection
    this.mainWindowService = new MainWindowService(this.closeHandle)
    this.parseService = new ParseService(this.mainWindowService)
  }

  /**
   * 执行任务
   */
  async start() {
    let timer: NodeJS.Timeout | undefined
    let settled: boolean = false
    const safeReject = (e: any, reject: Function) => {
      if (settled) return
      settled = true
      reject(false)
    }
    const safeResolve = (v: any, resolve: Function) => {
      if (settled) return
      settled = true
      resolve(true)
    }
    return new Promise(async (resolve, reject) => {
      try {
        timer = setInterval(async () => {
          if (this.inspection.status === 'cancelled' || this.inspection.status === 'failed') {
            clearInterval(timer)
            safeReject('任务已终止', reject)
          }
        }, 1000)
        memoryMonitor.trackBusinessMetrics({
          taskId: this.inspection._id,
          taskName: this.inspection.shopName,
          phase: 'start',
        })
        await this.updateTaskStatus('running')
        await this.outputLog('开始执行任务')
        await this.mainWindowService.createCollectionWindow(this.inspection.shopUrl)
        await this.getHtmlData()
        if (this.inspection.status !== 'cancelled' && this.inspection.status !== 'failed') {
          await this.updateTaskStatus('completed')
          await this.outputLog('任务完成')
        }
      } catch (error) {
        if (this.inspection.status !== 'cancelled' && this.inspection.status !== 'failed') {
          await this.updateTaskStatus('failed')
          await this.outputLog('任务执行失败')
        }
      } finally {
        clearInterval(timer)
        await this.mainWindowService.destroy()
        safeResolve(true, resolve)
        memoryMonitor.trackBusinessMetrics({
          taskId: this.inspection._id,
          taskName: this.inspection.shopName,
          phase: 'cleanup',
        })
      }
    })
  }

  /**
   * 获取页面上的数据
   */
  async getHtmlData() {
    try {
      let scrollAttempts = 0
      const maxScrollAttempts = 10
      let bottomOutCount = 0
      this.outputLog('页面加载成功')
      const { html, domain } = await this.mainWindowService.getHTML()
      const goodsList = await this.parseService.ozonListParser(html, domain)
      if (goodsList?.length) await this.saveData(goodsList)
      while (true) {
        if (this.inspection.status === 'cancelled' || this.inspection.status === 'failed') {
          throw new Error('任务已终止')
        }
        if (scrollAttempts >= maxScrollAttempts) {
          log.info(`${this.inspection.shopName}-10次无法获取商品数据，结束任务`)
          break
        }
        if (bottomOutCount >= 3) {
          log.info(`${this.inspection.shopName}-滚动到底部3次，结束任务`)
          break
        }
        await new Promise((resolve) => setTimeout(resolve, 4000))
        if (this.inspection.status !== 'running') break;
        const result = await this.mainWindowService.scrollPage()
        scrollAttempts++
        if (!result) {
          bottomOutCount++
          await new Promise((resolve) => setTimeout(resolve, 5000))
          continue
        }
        if (this.inspection.status !== 'running') break;
        const { html, domain } = await this.mainWindowService.getHTML()
        if (!html) {
          continue
        }
        if (this.inspection.status !== 'running') break;
        const goodsList = await this.parseService.ozonListParser(html, domain)
        if (goodsList.length) {
          scrollAttempts = 0
        }
        if (this.inspection.status !== 'running') break;
        await this.saveData(goodsList)
      }
    } catch (error) {
      log.error(error, '采集窗口发生错误')
      throw error
    }
  }

  /**
   * 关闭窗口
   */
  closeHandle = async () => {
    if (this.inspection.status !== 'completed' && this.inspection.status !== 'cancelled') {
      await this.updateTaskStatus('failed')
      this.outputLog('窗口异常关闭')
    }
  }

  /**
   * 改变任务状态
   */
  async updateTaskStatus(status: TaskStatus) {
    if (this.inspection.status === status) return
    this.inspection.status = status
    await updateTaskStatusAPI({
      taskId: this.inspection._id,
      status,
    })
  }

  /**  
   * 终止任务
   */
  async stopTask() {
    if (this.inspection.status === 'cancelled') throw new Error('任务正在取消中，请勿频繁请求')
    this.mainWindowService.destroy()
    await this.updateTaskStatus('cancelled')
    this.outputLog('任务取消')
  }

  /**
   * 保存数据
   */
  async saveData(data: any[]) {
    if (this.inspection.status !== 'running') return;
    const dataMap = new Map()
    const target = data.map((item) => {
      dataMap.set(item.id, item.followList || [])
      return {
        id: item.id,
        link: item.link,
        cover: item.cover,
        nameLabel: item.nameLabel,
        resMoney: item.price,
        followMinPrice: item.followMinPrice,
        followMaxPrice: item.followMaxPrice,
        sellerNumber: item.sellerNumber,
      }
    })
    const followedCount = target.reduce((acc, cur) => {
      if (cur.sellerNumber) return acc + 1
      return acc
    }, 0)
    this.progress.followedCount += followedCount
    this.progress.inspectedCount += target.length
    if (target?.length) this.outputLog(`已追踪${target.length}个商品`)
    const { data: res } = await batchSaveSellDataAPI({
      taskId: this.inspection._id,
      data: target
    })
    for (const item of target) {
      if (this.inspection.status !== 'running') return
      const obj = res.find(subItem => item.id === subItem.sku)
      if (obj) {
        const followList = dataMap.get(item.id) || []
        while (followList?.length) {
          if (this.inspection.status !== 'running') return;
          await saveSellListDataAPI({ items: followList.splice(0, 500), dataId: obj.dataId })
        }
      }
    }
    if (target?.length) this.outputLog('数据保存成功')
  }

  /**
  * 获取任务信息
  */
  getTaskInfo() {
    return this.inspection
  }
  /**
   * 日志输出
   */
  outputLog(taskLog: string) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('inspection-progress', {
        inspectionTask: { ...this.inspection, ...this.progress },
        log: { date: `[${dayjs(Date.now()).format('YYYY/MM/DD HH:mm:ss')}]`, taskLog },
      })
    }
  }
}
