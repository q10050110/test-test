import { Task, TaskStatus, Reason } from './type.js'
import { MainWindowService } from './main-window.services.js'
import { WindowService } from './1688-window.services.js'
import { ExcelService } from './excel.services.js'
import { TaskQueueService } from './task-queue.services.js'
import { DataProcessService } from './data-filter.services.js'
import { ParseService } from './parse.services.js'
import { BrowserWindow } from 'electron'
import request from '../../utils/request.js'
import log from '../../log/index.js'
import dayjs from 'dayjs'
import { randomUUID } from 'crypto'
import { autoUpGoods } from './interface.services.js'
import { memoryMonitor } from '../memory-monitor.services.js'

export class Collection {
  private uuid: string | undefined = undefined
  private task: Task // 任务信息
  private mainWindow: BrowserWindow | null = null // 主窗口
  private mainWindowService: MainWindowService // ozon窗口
  private windowService: WindowService // 1688窗口
  private taskQueueService: TaskQueueService // 1688任务队列
  private excelService: ExcelService
  private dataProcessService: DataProcessService
  private parseService: ParseService
  private targetData = 0 // 完成的任务
  private reason: Reason = undefined
  private isCleared = false
  private goodsData: Map<string, any> = new Map()
  private process = 0 // 正在处理的任务
  private writeError = false // 写入错误
  private isWrite = false // 是否写入
  private writeQueue: any[] = []
  constructor(task: Task, mainWindow: BrowserWindow) {
    this.task = task
    this.mainWindow = mainWindow
    this.mainWindowService = new MainWindowService(this.closeHandle)
    this.windowService = new WindowService()
    this.taskQueueService = new TaskQueueService(this.taskHandle)
    this.excelService = new ExcelService(task.taskName)
    this.dataProcessService = new DataProcessService()
    this.parseService = new ParseService(this.mainWindowService)
  }
  run() {
    let timer: NodeJS.Timeout | undefined
    let settled: boolean = false
    const safeResolve = (v: any, resolve: Function) => {
      if (settled) return
      settled = true
      resolve({ filePath: this.task.tableFilePath || '', progress: { ...this.task.progress, current: 0 }, autoResult: this.task.autoResult || undefined })
    }
    const safeReject = (e: any, reject: Function) => {
      if (settled) return
      settled = true
      reject({ filePath: this.task.tableFilePath || '', progress: { ...this.task.progress, current: 0 }, autoResult: this.task.autoResult || undefined })
    }

    return new Promise(async (resolve, reject) => {
      try {
        timer = setInterval(async () => {
          if (this.reason === 'cancel' || this.reason === 'failed') {
            clearInterval(timer)
            safeReject('任务已终止', reject)
          }
        }, 1000)
        memoryMonitor.trackBusinessMetrics({
          taskId: this.task._id,
          taskName: this.task.taskName,
          phase: 'start'
        })
        await this.resetTask()
        this.uuid = randomUUID()
        this.updateStatus('running')
        this.outputLog('窗口创建成功，任务开始执行')
        await this.mainWindowService.createCollectionWindow(this.task.targetUrl)
        this.outputLog('页面解析成功，开始获取商品列表')
        await this.getHtmlData(this.task.targetCount)
        memoryMonitor.trackBusinessMetrics({
          taskId: this.task._id,
          phase: 'collected',
          goodsDataSize: this.goodsData.size,
          parseServiceDataSize: this.parseService.getDataCount()
        })
        await this.waitForAllTasks()
        if (this.reason !== 'success') {
          safeReject('任务已被终止', reject)
          return
        }
        if (this.task.isUseAutoUpGoods) this.task.autoResult = await autoUpGoods(this.task, this.goodsData)
        await this.reWriteTable()
        this.updateStatus('completed')
        this.outputLog('任务完成')
      } catch (error) {
        if (this.reason) return
        this.updateStatus('failed')
        this.outputLog(`采集失败：${error}`)
      } finally {
        log.info(`ID：${this.task._id} 名称：${this.task.taskName}任务结束，最终状态：${this.task.taskStatus}，开始清理工作`)
        clearInterval(timer)
        this.mainWindowService.destroy()
        // this.clearStatus(true)
        // 清理后手动触发 GC
        memoryMonitor.forceGC()
        safeResolve(this.task, resolve)
        log.info(`ID：${this.task._id} 名称：${this.task.taskName}任务结束，最终状态：${this.task.taskStatus}，完成清理工作`)
        memoryMonitor.trackBusinessMetrics({
          taskId: this.task._id,
          phase: 'cleanup',
          goodsDataSize: this.goodsData.size
        })
      }
    })
  }


  /** 
   * 获取页面数据
    */
  async getHtmlData(targetCount: number) {
    try {
      let scrollAttempts = 0
      const maxScrollAttempts = 10
      let bottomOutCount = 0
      const { html, domain } = await this.mainWindowService.getHTML()
      const goodsList = await this.parseService.ozonListParser(html, domain)

      if (goodsList.length) this.processData(goodsList)
      while (this.targetData < targetCount) {
        if (this.reason && this.reason !== 'success') throw new Error('任务终止')

        if (this.taskQueueService.getTaskCount() > 20) {
          this.outputLog('任务队列数据源充足，等待处理中')
          await new Promise(resolve => setTimeout(resolve, 2000))
          continue
        }
        if (scrollAttempts >= maxScrollAttempts) {
          if (!this.reason) this.reason = 'success'
          this.outputLog('尝试获取商品达到最大次数')
          return
        }

        if (bottomOutCount >= 3) {
          if (!this.reason) this.reason = 'success'
          this.outputLog('已滚动至页面底部')
          return
        }

        await new Promise(resolve => setTimeout(resolve, 2000))
        this.outputLog(`滚动页面加载数据中，(${scrollAttempts}/${maxScrollAttempts})，已收集${this.parseService.getDataCount()}`)
        const result = await this.mainWindowService.scrollPage()
        scrollAttempts++
        if (!result) {
          bottomOutCount++
          await new Promise(resolve => setTimeout(resolve, 5000))
          continue
        }

        const { html, domain } = await this.mainWindowService.getHTML()
        if (!html) continue
        const goodsList = await this.parseService.ozonListParser(html, domain)
        if (goodsList.length) {
          scrollAttempts = 0
          this.processData(goodsList)
        }
      }
      if (!this.reason) this.reason = 'success'
      this.outputLog(`收集完成，共收集到 ${this.parseService.getDataCount()} 个链接`)
    } catch (error) {
      log.error(error, '采集窗口发生错误')
      return error
    }
  }

  /**
   * 处理获取到的数据
    */
  private async processData(goodsList: any[]) {
    let uuid = this.uuid
    try {
      let baseDataList = await this.dataProcessService.getBaseData(goodsList)
      this.outputLog(`获取商品数据中`)
      this.process += baseDataList.length
      const filterDataList = !this.task.aiSelectType ? await this.dataProcessService.aiFilterData(baseDataList) : await this.dataProcessService.filterData(baseDataList, this.task)
      this.outputLog(`筛选商品条件中`)
      baseDataList.filter(item => !filterDataList.map(item => item.id).includes(item.id)).forEach(async (item, i) => {
        await new Promise(resolve => setTimeout(() => {
          if (this.reason || uuid !== this.uuid) return
          this.process--
          this.outputLog(`完成商品${item.name}的处理`)
          resolve(true)
        }, i * 50))
      })
      if (filterDataList.length) {
        this.taskQueueService.addTask(filterDataList)
        this.taskQueueService.startProcessing()
        this.outputLog('处理符合筛选条件的商品中')
      }
    } catch (error) {
      return error
    }
  }
  /** 
   * 更改任务状态
    */
  async updateStatus(status: TaskStatus) {
    if (status === 'pending') this.resetTask()
    let uuid = this.uuid
    if (this.task.taskStatus === status || uuid !== this.uuid) return
    try {
      this.task.taskStatus = status;
      await this.syncStatusToServer(status);
    } catch (error) {
      log.error('更新任务状态失败', error);
    }
  }

  // 同步状态到服务器
  private async syncStatusToServer(status: TaskStatus) {
    try {
      await request({
        url: '/api/auto/autoTask/updateStatus',
        method: 'post',
        data: {
          taskId: this.task._id,
          taskStatus: status,
        },
      })
      const res = await request({
        url: '/api/auto/autoTask/getTaskById',
        method: 'post',
        data: {
          taskId: this.task._id
        }
      })
      this.updateTaskData(res.data)
      this.outputLog('任务状态同步至云端')
    } catch (error) {
      log.error('同步任务状态到服务器失败', error);
    }
  }
  /** 
   * 日志输出
  */
  outputLog(taskLog: string) {
    let uuid = this.uuid
    if (this.uuid !== uuid) return
    this.task.progress = {
      current: this.process < 0 ? 0 : this.process,
      total: this.parseService.getDataCount(),
      totalCount: this.targetData
    }

    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('task-progress', {
        collectionTask: this.task,
        log: { date: `[${dayjs(Date.now()).format('YYYY/MM/DD HH:mm:ss')}]`, taskLog },
      });
    }
  }

  /** 
   * 处理单个任务
    */
  taskHandle = async (task: any) => {
    log.info(`开始处理商品:${task.id}`)
    let timer: NodeJS.Timeout | undefined
    let maxTimer = 120
    let countDown = 0
    let settled = false
    let uuid = this.uuid
    const safeReject = (v: any, reject: Function) => {
      if (settled) return
      settled = true
      reject(v)
    }
    return new Promise(async (resolve, reject) => {
      try {
        timer = setInterval(() => {
          countDown++
          if (this.reason === 'cancel' || this.reason === 'failed' || countDown >= maxTimer) {
            clearInterval(timer)
            if (this.uuid === uuid) this.process--
            safeReject(new Error('任务超时'), reject)
          }
        }, 1000)
        const safeResolve = (v: any) => {
          if (settled) return
          settled = true
          resolve(v)
          if (this.reason != 'cancel' && this.reason !== 'failed' && this.uuid === uuid) {
            clearInterval(timer)
          }
        }

        if (this.targetData >= this.task.targetCount && this.uuid === uuid) {
          safeResolve('任务已完成')
          return
        }
        log.info(`获取1688数据:${task.id}`)
        const $ = await this.windowService.createWindow(this.task.sourceType, task.cover)

        const { link1688, sourcePrice, cover2 } = await this.parseService['1688Parse']($, task)
        if (this.reason === 'cancel' || this.reason === 'failed' || this.uuid !== uuid) {
          safeResolve(new Error('任务已被终止'))
          return
        }
        task = { ...task, '1688link': link1688, sourcePrice, cover2, myProfitPercent: this.task.myProfitPercent, rubExpressPrice: this.task.rubExpressPrice, internalExpress: this.task.internalExpress }
        log.info(`获取1688数据完成:${task.id}`)
        let detailData = await this.dataProcessService.getDetailData({ taskId: this.task._id, reqDatas: [task] })
        log.info(`获取详细数据:${task.id}`)
        this.writeQueue.push(detailData)
        this.writeTable()
        safeResolve('单个商品处理完成')
        log.info(`商品处理完成:${task.id}`)
      } catch (error) {
        log.error(error, '单个商品任务失败')
        safeReject(new Error('单个商品任务失败'), reject)
      }
    })
  }

  /** 
   * 写入表格
    */
  async writeTable() {
    const uuid = this.uuid
    if (this.isWrite) return
    this.isWrite = true
    while (this.writeQueue.length) {
      if (this.targetData < this.task.targetCount && (this.reason === 'success' || this.reason === undefined) && this.uuid === uuid) {
        const data = this.writeQueue.shift()
        const result = await this.excelService.saveExcel(data)
        this.goodsData.set(data[0]?.id, data?.[0])
        this.targetData++
        this.process--
        if (!result) this.writeError = true
        if (!this.task.tableFilePath) this.task.tableFilePath = await this.excelService.getFilePath()
        this.outputLog('单个商品处理完成')
      } else {
        break
      }
    }
    this.isWrite = false
  }

  /** 
   * 窗口被关闭回调
   */
  closeHandle = async () => {
    let uuid = this.uuid
    if (!this.reason && this.uuid === uuid) {
      await this.reWriteTable()
      this.reason = 'failed'
      // await this.clearStatus()
      this.process = 0
      this.updateStatus('failed')
      this.outputLog('窗口异常关闭')
      log.info('窗口异常关闭')
    }
  }
  /** 
     * 等待任务结束
      */
  private async waitForAllTasks(): Promise<void> {
    while (this.taskQueueService.getTaskCount() > 0 || this.taskQueueService.getActiveCount()) {
      if (this.reason === 'cancel' || this.reason === 'failed' || this.targetData >= this.task.targetCount) return
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  /** 
   * 重置任务
    */
  async resetTask() {
    this.process = 0
    await this.excelService.DeleteFilled()
    this.task.tableFilePath = undefined
    this.task.autoResult = undefined
    this.isCleared = false
    this.reason = undefined
    await this.dataProcessService.destroy()
    await this.taskQueueService.destroy()
    this.uuid = undefined
    this.outputLog('任务初始化完成')
  }
  /** 
   * 获取任务信息 
  */
  getTaskInfo() {
    return this.task;
  }
  /** 
   * 获取表格路径
    */
  async getTableFilePath() {
    return this.excelService.getFilePath()
  }
  /** 
   * 更新任务
  */
  async updateTaskData(task: Partial<Task>) {
    // 只更新允许更新的字段，保留原始的 id、createTime 等
    Object.assign(this.task, {
      ...task,
      _id: this.task._id, // 确保 id 不被覆盖
      taskStatus: this.task.taskStatus, // 保持当前状态
      progress: this.task.progress
    });
  }
  /** 
   * 取消任务
    */
  async cancel() {
    if (this.reason === 'cancel') throw new Error('任务正在取消中，请勿频繁请求')
    this.reason = 'cancel'
    this.reWriteTable()
    // this.clearStatus(true)
    this.process = 0
    this.mainWindowService.destroy()
    this.updateStatus('cancelled')
    this.outputLog('任务已取消')
  }

  /** 
   * 重新写入表格
    */
  async reWriteTable() {
    if (this.writeError) await this.excelService.flushToDisk()
    this.writeError = false
  }
  /** 
   * 清理工作
    */
  clearStatus(isRetainCompletedTasks = false, isDestroy = true) {
    let uuid = this.uuid
    if (this.isCleared || this.uuid !== uuid) return
    this.isCleared = true
    this.process = 0
    this.windowService.destroy()
    this.windowService.destroy()
    this.excelService.destroy()
    this.taskQueueService.destroy(isRetainCompletedTasks, isDestroy)
    this.outputLog('清理完成')
  }
}