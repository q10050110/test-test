import { Task, TaskStatus } from './type.js'
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

export class Collection {
  private task: Task // 任务信息
  private mainWindow: BrowserWindow | null = null // 主窗口
  private mainWindowService: MainWindowService // ozon窗口
  private windowService: WindowService // 1688窗口
  private taskQueueService: TaskQueueService // 1688任务队列
  private excelService: ExcelService
  private dataProcessService: DataProcessService
  private parseService: ParseService
  private targetData = 0 // 完成的任务
  private isCancel = false // 是否取消
  private process = 0 // 正在处理的任务
  constructor(task: Task, mainWindow: BrowserWindow) {
    this.task = task
    this.mainWindow = mainWindow
    this.mainWindowService = new MainWindowService()
    this.windowService = new WindowService()
    this.taskQueueService = new TaskQueueService(this.taskHandle)
    this.excelService = new ExcelService(task.taskName)
    this.dataProcessService = new DataProcessService()
    this.parseService = new ParseService()
  }
  async run() {
    try {
      this.updateStatus('running')
      this.outputLog('窗口创建成功，任务开始执行')
      await this.mainWindowService.createCollectionWindow(this.task.targetUrl)
      this.outputLog('页面解析成功，开始获取商品列表')
      await this.getHtmlData(this.task.targetCount)
      await this.waitForAllTasks()
      this.updateStatus('completed')
      this.outputLog('任务完成')
    } catch (error) {
      log.error(error)
      this.updateStatus('failed')
      this.outputLog(`采集失败：${error}`)
    } finally {
      log.info('任务结束，开始清理工作')
      await this.clearStatus()
      return this.task
    }
  }


  /** 
   * 获取页面数据
    */
  async getHtmlData(targetCount: number) {
    try {
      let scrollAttempts = 0
      const maxScrollAttempts = 10
      const { $, domain } = await this.mainWindowService.getHTML()
      if (!$) return
      const goodsList = await this.parseService.ozonListParser($, domain)
      if (goodsList.length) this.processData(goodsList)
      while (this.targetData < targetCount) {
        if (this.isCancel) return

        if (this.taskQueueService.getTaskCount() > 20) {
          this.outputLog('任务队列数据源充足，等待处理中')
          await new Promise(resolve => setTimeout(resolve, 2000))
          continue
        }
        if (scrollAttempts >= maxScrollAttempts) {
          this.outputLog('尝试获取商品达到最大次数')
          return
        }
        await new Promise(resolve => setTimeout(resolve, 2000))
        this.outputLog(`滚动页面加载数据中，(${scrollAttempts}/${maxScrollAttempts})，已收集${this.parseService.getDataCount()}`)
        const result = await this.mainWindowService.scrollPage()
        scrollAttempts++
        if (!result) {
          this.outputLog('已滚动至页面底部')
          return
        }
        const { $, domain } = await this.mainWindowService.getHTML()
        if (!$) return
        const goodsList = await this.parseService.ozonListParser($, domain)
        if (goodsList.length) {
          scrollAttempts = 0
          this.processData(goodsList)
        }
        await new Promise(resolve => setTimeout(resolve, 2000))
      }

      this.outputLog(`收集完成，共收集到 ${this.task.targetCount} 个链接`)
    } catch (error) {
      return error
    }
  }

  /**
   * 处理获取到的数据
    */
  private async processData(goodsList: any[]) {
    try {
      let baseDataList = await this.dataProcessService.getBaseData(goodsList)
      this.outputLog(`获取商品数据中`)
      this.process += baseDataList.length
      const filterDataList = await this.dataProcessService.filterData(baseDataList, this.task)
      this.outputLog(`筛选商品条件中`)
      baseDataList.filter(item => !filterDataList.map(item => item.id).includes(item.id)).forEach(async (item, i) => {
        await new Promise(resolve => setTimeout(() => {
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
      });
    } catch (error) {
      log.error('同步任务状态到服务器失败', error);
    }
  }
  /** 
   * 日志输出
  */
  outputLog(taskLog: string) {
    this.task.progress = {
      current: this.process,
      total: this.parseService.getDataCount(),
      totalCount: this.taskQueueService.getCompletedTasksCount()
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
    try {
      if (this.isCancel) throw new Error('任务被终止')
      if (this.targetData >= this.task.targetCount) return
      const $ = await this.windowService.createWindow(this.task.sourceType, task.cover)
      const { link1688, sourcePrice, cover2 } = await this.parseService['1688Parse']($, task)
      task = { ...task, '1688link': link1688, sourcePrice, cover2 }
      const detailData = await this.dataProcessService.getDetailData({ taskId: this.task._id, reqDatas: [task] })
      const result = await this.excelService.saveExcel(detailData)
      if (!this.task.tableFilePath) this.task.tableFilePath = await this.excelService.getFilePath()
      if (result) {
        this.process--
        this.targetData++
      } else {
        this.process--
        this.outputLog('写入表格失败')
      }

    } catch (error) {
      log.error(error)
      this.outputLog(error as string)
      return
    }
  }
  /** 
   * 等待任务结束
    */
  private async waitForAllTasks(): Promise<void> {
    while (this.taskQueueService.getTaskCount() > 0 || this.taskQueueService.getActiveCount()) {
      if (this.isCancel) return
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  /** 
   * 重置任务
    */
  resetTask() {
    this.isCancel = false
    this.clearStatus()
    this.parseService.clearData()
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
      createTime: this.task.createTime, // 确保创建时间不被覆盖
      taskStatus: this.task.taskStatus, // 保持当前状态
    });
  }
  /** 
   * 取消任务
    */
  async cancel() {
    if (this.isCancel) throw new Error('任务正在取消中，请勿频繁请求')
    this.isCancel = true
    this.mainWindowService.abort('cancel')
    this.updateStatus('cancelled')
    this.outputLog('任务已取消')
  }
  /** 
   * 清理工作
    */
  async clearStatus() {
    this.process = 0
    this.mainWindowService.closeCollectionWindow()
    this.taskQueueService.clear()
  }
}