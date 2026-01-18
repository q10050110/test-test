import axios from 'axios'
import dayjs from 'dayjs'
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import { BrowserWindow } from 'electron'
import * as cheerio from 'cheerio'
import log from '../log/index.js'
export type TaskStatus = 'noExecuted' | 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
import { ExcelWriter } from '../utils/excel.js'
export interface Task {
  id: string
  status: TaskStatus
  progress: any
  createTime: string
  updateTime: string
  taskName: string
  targetUrl: string
  myProfitPercent?: number
  internalExpress?: string
  rubExpressPrice?: number
  elsePercent?: number
  sourceType: string
  targetCount: string
  targetProfitPercent: number
  brandType?: string
  soldCountMin?: number
  soldCountMax?: number
  gmvSumMin?: number
  gmvSumMax?: number
  salePriceMin?: number
  salePriceMax?: number
  weightMin?: number
  weightMax?: number
  upGoodsTimeMin?: number
  upGoodsTimeMax?: number
  monthDynamicsMin?: number
  monthDynamicsMax?: number
  adFeeMin?: number
  adFeeMax?: number
  promotionDayMin?: number
  promotionDayMax?: number
  promotionDiscountMin?: number
  promotionDiscountMax?: number
  promotionDynamicsMin?: number
  promotionDynamicsMax?: number
  promoteDayMin?: number
  promoteDayMax?: number
  viewsMin?: number
  viewsMax?: number
  cardRateMin?: number
  cardRateMax?: number
  showRateMin?: number
  showRateMax?: number
  salesSchema?: string
  followMin?: number
  followMax?: number
  token?: string
  log?: { date: string, log: string }[]
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
export class Collection {
  private collectionTask: Task
  private browserWindow: BrowserWindow | null = null
  private mainWindow: BrowserWindow
  private excel: ExcelWriter | null = null
  private extractedLinks: string[] = [] //处理中
  private collectedLinks: string[] = [] // 累计爬取
  private matchList: any[] = []
  constructor(task: Task, mainWindow: BrowserWindow) {
    this.collectionTask = { ...task } // 深拷贝任务对象
    this.mainWindow = mainWindow
    this.excel = new ExcelWriter(join(__dirname, '../public/excel/', this.collectionTask.taskName))
  }

  // 补全任务信息
  complementTaskInfo() {
    if (this.collectionTask.id) return
    const id = Math.random().toString(36).substring(2, 9)
    const status = 'pending' // 修改初始状态为 pending，而不是 running
    const createTime = dayjs(Date.now()).format('YYYY-MM-DD HH:mm:ss')
    const updateTime = dayjs(Date.now()).format('YYYY-MM-DD HH:mm:ss')
    this.collectionTask.id = id
    this.collectionTask.status = status
    this.collectionTask.createTime = createTime
    this.collectionTask.updateTime = updateTime
  }

  // 更新任务数据
  updateTaskData(task: Partial<Task>) {
    // 只更新允许更新的字段，保留原始的 id、createTime 等
    Object.assign(this.collectionTask, {
      ...task,
      id: this.collectionTask.id, // 确保 id 不被覆盖
      createTime: this.collectionTask.createTime, // 确保创建时间不被覆盖
      status: this.collectionTask.status, // 保持当前状态
      updateTime: dayjs(Date.now()).format('YYYY-MM-DD HH:mm:ss') // 更新时间戳
    })
  }

  // 更新任务状态
  updateStatus(status: TaskStatus, log?: string) {
    this.collectionTask.status = status
    this.collectionTask.updateTime = dayjs(Date.now()).format('YYYY-MM-DD HH:mm:ss')
    this.collectionTask.progress = {
      current: this.extractedLinks.length > +this.collectionTask.targetCount ? this.collectionTask.targetCount : this.extractedLinks.length,
      total: this.collectedLinks.length > +this.collectionTask.targetCount ? this.collectionTask.targetCount : this.collectedLinks.length
    }
    if (this.mainWindow) this.mainWindow.webContents.send('task-progress', {
      collectionTask: this.collectionTask,
      log: { date: `[${dayjs(Date.now()).format('YYYY/MM/DD HH:mm:ss')}]`, log }
    })
  }

  // 通知前端任务状态变更
  // 重置任务状态（用于重新执行）
  resetTask() {
    this.collectionTask.status = 'pending'
    this.collectionTask.progress = {}
    this.collectionTask.updateTime = dayjs(Date.now()).format('YYYY-MM-DD HH:mm:ss')
    this.extractedLinks = []
    this.collectedLinks = []
  }

  // 获取任务状态
  getStatus() {
    return this.collectionTask.status
  }

  // 获取任务信息
  getTaskInfo() {
    return this.collectionTask
  }

  // 上传服务端
  async uploadServices() {
    const { data } = await axios.request({
      url: '/user',
      method: 'post',
      data: this.collectionTask
    })
    if (data.code === 0) return true
    return false
  }

  // 创建采集窗口
  async createCollectionWindow() {
    return new Promise<void>((resolve, reject) => {
      this.browserWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        show: false,
        webPreferences: {
          contextIsolation: true,
          sandbox: true,
          nodeIntegration: false
        }
      })

      // 监听页面加载完成事件
      this.browserWindow.webContents.once('dom-ready', async () => {
        log.info('页面 DOM 已准备就绪')
        await this.parsePageData()
        resolve()
      })

      this.browserWindow.loadURL(this.collectionTask.targetUrl)
    })
  }

  // 模拟滚动并收集
  async simulateScrollAndCollect() {
    if (!this.browserWindow) {
      log.error('浏览器窗口不存在')
      return
    }

    const targetCount = parseInt(this.collectionTask.targetCount || '0')
    if (targetCount <= 0) {
      log.info('目标数量无效，跳过滚动采集')
      return
    }

    await this.collectLinksByTargetCount(targetCount)
  }

  // 解析页面数据
  private async parsePageData() {
    this.updateStatus('running', '正在解析页面数据')

    // 等待页面完全加载
    await this.delay(2000)

    // 开始滚动采集过程
    await this.simulateScrollAndCollect()
  }

  // 滚动延迟辅助函数
  private async delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  // 生成随机延迟时间
  private getRandomDelay(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min
  }

  // 辅助方法：确保 URL 是绝对路径
  private ensureAbsoluteUrl(url: string, baseUrl: string): string {
    try {
      return new URL(url, baseUrl).href
    } catch (e) {
      return url // 如果 URL 构造失败，返回原始 URL
    }
  }

  // 根据目标数量收集链接
  private async collectLinksByTargetCount(targetCount: number) {
    if (!this.browserWindow) return []

    let scrollAttempts = 0
    const maxScrollAttempts = 30 // 增加最大尝试次数

    this.updateStatus('running', `开始采集链接，目标数量: ${targetCount}`)

    // 等待页面加载
    await this.delay(2000)

    // 获取初始链接
    const initialLinks = await this.extractLinks()
    this.collectedLinks = [...initialLinks]

    this.updateStatus('running', `初始加载 ${this.collectedLinks.length} 个链接`)

    // 如果还没达到目标数量，继续滚动加载
    while (this.collectedLinks.length < targetCount && scrollAttempts < maxScrollAttempts) {
      const previousLength = this.collectedLinks.length

      // 随机延迟，模拟人类行为
      const randomDelay = this.getRandomDelay(1000, 2000)
      this.updateStatus('running', `滚动加载中... (${scrollAttempts + 1}/${maxScrollAttempts})，已收集: ${this.collectedLinks.length}/${targetCount}`)

      await this.delay(randomDelay)

      // 执行滚动操作 - 滚动整个页面
      const scrollSuccess = await this.performScroll()

      if (!scrollSuccess) {
        log.info('滚动操作未成功执行，可能已到达底部')
        break
      }

      // 等待新内容加载
      await this.delay(2000)

      // 提取新链接 - 从指定容器提取
      const newLinks = await this.extractLinks()
      const uniqueNewLinks = newLinks.filter(link => !this.collectedLinks.includes(link))

      if (uniqueNewLinks.length > 0) {
        this.collectedLinks = [...this.collectedLinks, ...uniqueNewLinks]
        log.info(`新增 ${uniqueNewLinks.length} 个链接，总计: ${this.collectedLinks.length}`)
      }

      this.updateStatus('running', `已收集 ${this.collectedLinks.length} / ${targetCount} 个链接`)

      // 判断是否需要继续滚动
      if (this.collectedLinks.length === previousLength) {
        log.info('本次滚动未发现新链接')
        scrollAttempts++
      } else {
        scrollAttempts = 0 // 有新链接，重置尝试次数
      }

      // 如果已达到目标数量，停止滚动
      if (this.collectedLinks.length >= targetCount) {
        break
      }
    }

    log.info(`最终收集到 ${this.collectedLinks.length} 个链接`)
    this.updateStatus('completed', `任务完成，共收集到 ${this.collectedLinks.length} 个链接`)

    return this.collectedLinks.slice(0, targetCount)
  }
  // 处理链接
  private async handleLink(links: string[]) {
    const requestList = []
    for (const link of links) {
      const id = link.match(/-(\d+)(?=\/|\?)/)?.[1] || null
      // todo 发起请求
      requestList.push(axios.request({
        url: '',
        method: 'get',
      }))
    }
    try {
      await Promise.all(requestList).then(res => {
        console.log(res)
        // 写入数据
        this.excel?.addRow
      }).catch(err => {
        console.log(err)
      })
      this.excel?.save()
    } catch (error) {

    }
  }
  // 执行滚动操作 - 滚动整个页面窗口
  private async performScroll(): Promise<boolean> {
    if (!this.browserWindow) return false

    try {
      const result = await this.browserWindow.webContents.executeJavaScript(`
        (function() {
          // 获取当前页面滚动位置和文档高度
          const currentScrollY = window.scrollY || window.pageYOffset || document.documentElement.scrollTop;
          const documentHeight = Math.max(
            document.body.scrollHeight, 
            document.body.offsetHeight, 
            document.documentElement.clientHeight, 
            document.documentElement.scrollHeight, 
            document.documentElement.offsetHeight
          );
          const windowHeight = window.innerHeight || document.documentElement.clientHeight || document.body.clientHeight;
          
          console.log(\`当前滚动位置: \${currentScrollY}, 文档总高度: \${documentHeight}, 窗口高度: \${windowHeight}\`);
          
          // 计算滚动目标位置（滚动窗口高度的80%）
          const scrollAmount = Math.floor(windowHeight * 0.8);
          const targetScrollY = Math.min(currentScrollY + scrollAmount, documentHeight - windowHeight);
          
          // 检查是否已到达页面底部
          if (currentScrollY >= (documentHeight - windowHeight - 10)) { // 10像素容差
            console.log('已到达页面底部，无法继续滚动');
            return false;
          }
          
          // 执行滚动
          window.scrollTo({
            top: targetScrollY,
            behavior: 'smooth' // 立即滚动，不使用平滑效果
          });
          
          // 确保滚动发生（有时 scrollTo 可能不执行）
          if (window.scrollY !== targetScrollY) {
            window.scroll(0, targetScrollY);
          }
          
          // 检查滚动是否成功
          const actualScrollY = window.scrollY || window.pageYOffset || document.documentElement.scrollTop;
          const scrollChanged = actualScrollY > currentScrollY;
          const hasReachedBottom = actualScrollY >= (documentHeight - windowHeight - 10);
          
          console.log(\`滚动后位置: \${actualScrollY}, 滚动是否生效: \${scrollChanged}, 是否到达底部: \${hasReachedBottom}\`);
          
          return scrollChanged;
        })();
      `);

      return result === true;
    } catch (error) {
      log.error(`${this.collectionTask.taskName}执行滚动时出错:`, error);
      return false;
    }
  }

  // 提取链接 - 从指定容器提取
  private async extractLinks(): Promise<string[]> {
    if (!this.browserWindow) return []

    try {
      const html = await this.browserWindow.webContents.executeJavaScript(
        'document.documentElement.outerHTML'
      )

      const $ = cheerio.load(html)
      const links = $('#contentScrollPaginator a')


      links.each((index, element) => {
        const href = $(element).attr('href')
        if (href) {
          const absoluteHref = this.ensureAbsoluteUrl(href, this.collectionTask.targetUrl)
          if (!this.extractedLinks.includes(absoluteHref)) {
            this.extractedLinks.push(absoluteHref)
          }
        }
      })
      log.info('下载链接：', this.extractedLinks)
      return this.extractedLinks
    } catch (error) {
      log.error(`${this.collectionTask.taskName}提取链接时出错:`, error)
      return []
    }
  }
  // 获取商品数据
  async getGoodsData() {

  }
  // 导出表格
  async initTable() {
    this.excel?.setColumns([
      { header: '商品名称', key: 'name' },
      { header: '商品链接', key: 'link' }
    ])
  }
  // 终止任务
  async cancel() {
    if (this.browserWindow) {
      this.browserWindow.close()
      this.browserWindow = null
    }
    this.updateStatus('cancelled', '任务已取消')
  }

  async run(): Promise<Task> {
    try {
      this.updateStatus('running', '任务开始执行...')

      await this.createCollectionWindow()
      await this.initTable()
      // 任务执行完成后关闭窗口
      if (this.browserWindow) {
        this.browserWindow.close()
        this.browserWindow = null
      }

      this.updateStatus('completed', '任务执行完成')
      // await this.uploadServices()
      return this.collectionTask
    } catch (error) {
      log.error(`${this.collectionTask.taskName}任务执行失败`, error)
      // 关闭窗口
      if (this.browserWindow) {
        this.browserWindow.close()
        this.browserWindow = null
      }
      this.updateStatus('failed', `任务执行失败: ${error instanceof Error ? error.message : '未知错误'}`)
      return this.collectionTask
    }
  }
}