import type { Inspection, TaskStatus, SaveSellDataParams } from './type'
import { MainWindowService } from './main-window.services.js'
import { updateTaskStatusAPI, batchSaveSellDataAPI } from './api.js'
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
    try {
      memoryMonitor.trackBusinessMetrics({
        taskId: this.inspection._id,
        taskName: this.inspection.shopName,
        phase: 'start',
      })
      await this.updateTaskStatus('running')
      await this.outputLog('开始执行任务')
      await this.mainWindowService.createCollectionWindow(this.inspection.shopUrl)
      await this.getHtmlData()
      await this.updateTaskStatus('completed')
      await this.outputLog('任务完成')
    } catch (error) {
      log.error(error, '巡查任务执行失败')
      await this.updateTaskStatus('failed')
      throw error
    } finally {
      await this.mainWindowService.destroy()
      memoryMonitor.trackBusinessMetrics({
        taskId: this.inspection._id,
        taskName: this.inspection.shopName,
        phase: 'cleanup',
      })
    }
  }

  /**
   * 获取页面上的数据
   */
  async getHtmlData() {
    try {
      let scrollAttempts = 0
      const maxScrollAttempts = 10
      let bottomOutCount = 0
      const { html, domain } = await this.mainWindowService.getHTML()
      const goodsList = await this.parseService.ozonListParser(html, domain)
      if (goodsList?.length) await this.saveData(goodsList)
      while (true) {
        if (this.inspection.status === 'cancelled') {
          throw new Error('任务取消')
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
        const result = await this.mainWindowService.scrollPage()
        scrollAttempts++
        if (!result) {
          bottomOutCount++
          await new Promise((resolve) => setTimeout(resolve, 5000))
          continue
        }
        const { html, domain } = await this.mainWindowService.getHTML()
        if (!html) {
          continue
        }
        const goodsList = await this.parseService.ozonListParser(html, domain)
        if (goodsList.length) {
          scrollAttempts = 0
        }
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
      this.outputLog('窗口异常关闭，任务失败')
      log.error('窗口异常关闭')
    }
  }

  /**
   * 改变任务状态
   */
  async updateTaskStatus(status: TaskStatus) {
    await updateTaskStatusAPI({
      taskId: this.inspection._id,
      status,
    })
    this.inspection.status = status
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
    const target = data.map((item) => ({
      id: item.id,
      link: item.link,
      cover: item.cover,
      nameLabel: item.nameLabel,
      resMoney: item.price,
      followMinPrice: item.followMinPrice,
      followMaxPrice: item.followMaxPrice,
      sellerNumber: item.sellerNumber,
      followList: item.followList
    }))
    console.log(target)
    await batchSaveSellDataAPI({
      taskId: this.inspection._id,
      data: target
    })
  }

  /**
   * 日志输出
   */
  outputLog(taskLog: string) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('inspection-progress', {
        inspectionTask: this.inspection,
        log: { date: `[${dayjs(Date.now()).format('YYYY/MM/DD HH:mm:ss')}]`, taskLog },
      })
    }
  }
}
