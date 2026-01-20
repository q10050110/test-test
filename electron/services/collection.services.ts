import request from '../utils/request.js';
import dayjs from 'dayjs';
import { dirname, join } from 'path';
import { BrowserWindow } from 'electron';
import * as cheerio from 'cheerio';
import log from '../log/index.js';
export type TaskStatus = 'noExecuted' | 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
import { ExcelWriter } from '../utils/excel.js';
import { SysTemUtils } from '../utils/system.js'

export interface Task {
  _id: string;
  taskStatus: TaskStatus;
  progress: any;
  createTime: string;
  updateTime: string;
  taskName: string;
  targetUrl: string;
  myProfitPercent?: number;
  internalExpress?: string;
  rubExpressPrice?: number;
  elsePercent?: number;
  sourceType: string;
  targetCount: string;
  targetProfitPercent: number;
  brandType?: string;
  soldCountMin?: number;
  soldCountMax?: number;
  gmvSumMin?: number;
  gmvSumMax?: number;
  salePriceMin?: number;
  salePriceMax?: number;
  weightMin?: number;
  weightMax?: number;
  upGoodsTimeMin?: number;
  upGoodsTimeMax?: number;
  monthDynamicsMin?: number;
  monthDynamicsMax?: number;
  adFeeMin?: number;
  adFeeMax?: number;
  promotionDayMin?: number;
  promotionDayMax?: number;
  promotionDiscountMin?: number;
  promotionDiscountMax?: number;
  promotionDynamicsMin?: number;
  promotionDynamicsMax?: number;
  promoteDayMin?: number;
  promoteDayMax?: number;
  viewsMin?: number;
  viewsMax?: number;
  cardRateMin?: number;
  cardRateMax?: number;
  showRateMin?: number;
  showRateMax?: number;
  salesSchema?: string;
  followMin?: number;
  followMax?: number;
  token?: string;
  log?: { date: string; log: string }[];
  tableFilePath?: string
}

const excelDir = join(SysTemUtils.getAppInfo().userDataPath, 'excel')
export class Collection {
  private collectionTask: Task;
  private browserWindow: BrowserWindow | null = null;
  private mainWindow: BrowserWindow;
  private excel: ExcelWriter | null = null;
  private collectedLinks: any[] = []; // 累计爬取
  private processed: number = 0;
  private totalCount: number = 0;
  private timers: NodeJS.Timeout[] = [];
  // 用于避免重复状态更新
  private lastServerStatus: TaskStatus | null = null;
  tableFilePath: string = '';

  // 用于跟踪异步任务
  private pendingTasks: Promise<any>[] = [];
  private isProcessingComplete: boolean = false;

  constructor(task: Task, mainWindow: BrowserWindow) {
    this.collectionTask = { ...task };
    this.mainWindow = mainWindow;
    this.excel = new ExcelWriter(join(excelDir, `${this.collectionTask.taskName}.xlsx`));
    this.tableFilePath = join(excelDir, `${this.collectionTask.taskName}.xlsx`);
    this.lastServerStatus = task.taskStatus;
  }

  // 清除所有挂起的任务
  private clearPendingTasks() {
    this.pendingTasks = [];
  }

  // 添加挂起任务
  private addPendingTask<T>(task: Promise<T>): Promise<T> {
    const wrappedTask = task.finally(() => {
      // 从挂起任务列表中移除已完成的任务
      const index = this.pendingTasks.indexOf(wrappedTask);
      if (index > -1) {
        this.pendingTasks.splice(index, 1);
      }
    });

    this.pendingTasks.push(wrappedTask);
    return wrappedTask;
  }

  // 等待所有挂起的任务完成
  private async waitForAllPendingTasks(): Promise<void> {
    if (this.pendingTasks.length > 0) {
      await Promise.all(this.pendingTasks);
    }
  }

  // 补全任务信息
  complementTaskInfo() {
    const status = 'noExecuted';
    const createTime = dayjs(this.collectionTask.createTime || Date.now()).format('YYYY-MM-DD HH:mm:ss');
    const updateTime = dayjs(this.collectionTask.updateTime || Date.now()).format('YYYY-MM-DD HH:mm:ss');
    this.collectionTask.taskStatus = status;
    this.collectionTask.createTime = createTime;
    this.collectionTask.updateTime = updateTime;
    this.lastServerStatus = status;
  }

  // 更新任务数据
  updateTaskData(task: Partial<Task>) {
    // 只更新允许更新的字段，保留原始的 id、createTime 等
    Object.assign(this.collectionTask, {
      ...task,
      _id: this.collectionTask._id, // 确保 id 不被覆盖
      createTime: this.collectionTask.createTime, // 确保创建时间不被覆盖
      taskStatus: this.collectionTask.taskStatus, // 保持当前状态
      updateTime: dayjs(Date.now()).format('YYYY-MM-DD HH:mm:ss'), // 更新时间戳
    });
  }

  // 更新任务状态
  async updateStatus(status: TaskStatus, taskLog?: string) {
    if (this.lastServerStatus === 'cancelled' && status === 'completed') return
    try {

      const previousStatus = this.collectionTask.taskStatus;
      this.collectionTask.taskStatus = status;
      this.collectionTask.updateTime = dayjs(Date.now()).format('YYYY-MM-DD HH:mm:ss');

      this.collectionTask.progress = {
        current: Math.min(this.processed, +this.collectionTask.targetCount),
        total: Math.min(this.collectedLinks.length, +this.collectionTask.targetCount),
        totalCount: Math.min(this.totalCount, +this.collectionTask.targetCount)
      };


      if (this.mainWindow) {
        this.mainWindow.webContents.send('task-progress', {
          collectionTask: this.collectionTask,
          log: { date: `[${dayjs(Date.now()).format('YYYY/MM/DD HH:mm:ss')}]`, taskLog },
        });
      }

      if (status !== previousStatus) {
        await this.syncStatusToServer(status);
      }
    } catch (error) {
      log.error('更新任务状态失败', error);

      if (this.mainWindow) {
        this.mainWindow.webContents.send('task-progress', {
          collectionTask: this.collectionTask,
          log: {
            date: `[${dayjs(Date.now()).format('YYYY/MM/DD HH:mm:ss')}]`,
            taskLog: `状态更新失败: ${error instanceof Error ? error.message : error}`
          },
        });
      }
    }
  }

  // 同步状态到服务器
  private async syncStatusToServer(status: TaskStatus) {
    try {
      await request({
        url: '/api/auto/autoTask/updateStatus',
        method: 'post',
        data: {
          taskId: this.collectionTask._id,
          taskStatus: status,
        },
      });
      this.lastServerStatus = status; // 记录最后成功更新到服务器的状态
    } catch (error) {
      log.error(`同步任务状态到服务器失败 (ID: ${this.collectionTask._id})`, error);
    }
  }

  // 重置任务状态（用于重新执行）
  async resetTask() {
    this.collectionTask.progress = {};
    this.processed = 0
    this.totalCount = 0
    this.collectionTask.updateTime = dayjs(Date.now()).format('YYYY-MM-DD HH:mm:ss');
    this.collectedLinks = [];
  }

  // 获取任务状态
  getStatus() {
    return this.collectionTask.taskStatus;
  }

  // 获取任务信息
  getTaskInfo() {
    return this.collectionTask;
  }

  // 创建采集窗口
  async createCollectionWindow() {
    return new Promise<void>(async (resolve, reject) => {
      this.browserWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        show: false,
        webPreferences: {
          contextIsolation: true,
          sandbox: true,
          nodeIntegration: false,
        },
      });

      // 监听页面加载完成事件
      this.browserWindow.webContents.once('dom-ready', async () => {
        log.info('页面 DOM 已准备就绪');
        await this.parsePageData();
        resolve();
      });

      this.browserWindow.loadURL(this.collectionTask.targetUrl);
    });
  }

  // 模拟滚动并收集
  async simulateScrollAndCollect() {
    if (!this.browserWindow) {
      log.error('浏览器窗口不存在');
      return;
    }

    const targetCount = parseInt(this.collectionTask.targetCount || '0');
    if (targetCount <= 0) {
      log.info('目标数量无效，跳过滚动采集');
      return;
    }

    await this.collectLinksByTargetCount(targetCount);
  }

  // 解析页面数据
  private async parsePageData() {
    this.updateStatus('running', '正在解析页面数据');

    // 等待页面完全加载
    await this.delay(2000);

    // 开始滚动采集过程
    await this.simulateScrollAndCollect();
  }

  // 滚动延迟辅助函数
  private async delay(ms: number) {
    return new Promise(resolve => {
      const timer = setTimeout(resolve, ms)
      this.timers.push(timer)
    });
  }

  // 生成随机延迟时间
  private getRandomDelay(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  // 辅助方法：确保 URL 是绝对路径
  private ensureAbsoluteUrl(url: string, baseUrl: string): string {
    try {
      return new URL(url, baseUrl).href;
    } catch (e) {
      return url; // 如果 URL 构造失败，返回原始 URL
    }
  }

  // 根据目标数量收集链接
  private async collectLinksByTargetCount(targetCount: number) {
    if (!this.browserWindow) return [];

    // 清除之前的挂起任务
    this.pendingTasks = [];
    this.isProcessingComplete = false;

    let scrollAttempts = 0;
    const maxScrollAttempts = 30; // 增加最大尝试次数

    this.updateStatus('running', `开始采集链接，目标数量: ${targetCount}`);

    // 等待页面加载 
    await this.delay(2000);

    // 获取初始链接
    const initialLinks = await this.extractLinks();
    this.collectedLinks = [...initialLinks];

    if (initialLinks.length) {
      this.handleLink(initialLinks); // 不等待，继续执行
    }

    await this.updateStatus('running', `初始加载 ${this.collectedLinks.length} 个链接`);

    // 如果还没达到目标数量，继续滚动加载
    while (this.collectedLinks.length < targetCount && scrollAttempts < maxScrollAttempts) {
      const previousLength = this.collectedLinks.length;
      if (this.collectionTask.taskStatus === 'cancelled') {
        console.log('退出函数！');
        return;
      }

      // 随机延迟，模拟人类行为
      const randomDelay = this.getRandomDelay(2000, 4000);
      this.updateStatus('running', `滚动加载中... (${scrollAttempts + 1}/${maxScrollAttempts})，已收集: ${Math.min(previousLength, +targetCount)}/${targetCount}`);

      await this.delay(randomDelay);

      // 执行滚动操作 - 滚动整个页面
      const scrollSuccess = await this.performScroll();

      if (!scrollSuccess) {
        log.info('滚动操作未成功执行，可能已到达底部');
        break;
      }

      // 等待新内容加载
      await this.delay(2000);

      // 提取新链接 - 从指定容器提取
      const newLinks = await this.extractLinks();
      const uniqueNewLinks = newLinks.filter(item => !this.collectedLinks.map(obj => obj.id).includes(item.id)).slice(0, targetCount - previousLength > 0 ? targetCount - previousLength : 0);
      if (uniqueNewLinks.length > 0) {
        this.collectedLinks = [...this.collectedLinks, ...uniqueNewLinks];
        this.handleLink(uniqueNewLinks); // 不等待，继续执行
      }

      this.updateStatus('running', `已收集 ${this.collectedLinks.length} / ${targetCount} 个链接`);

      // 判断是否需要继续滚动
      if (this.collectedLinks.length === previousLength) {
        log.info('本次滚动未发现新链接');
        scrollAttempts++;
      } else {
        scrollAttempts = 0; // 有新链接，重置尝试次数
      }

      // 如果已达到目标数量，停止滚动
      if (this.collectedLinks.length >= targetCount) {
        break;
      }
    }

    this.updateStatus('running', `收集完成，共收集到 ${Math.min(this.collectedLinks.length, +this.collectionTask.targetCount)} 个链接`);
    this.collectedLinks = this.collectedLinks.slice(0, targetCount)
    return this.collectedLinks
  }


  // 执行滚动操作 - 滚动整个页面窗口
  private async performScroll(): Promise<boolean> {
    if (!this.browserWindow) return false;

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
            behavior: 'smooth'
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

  // 提取链接
  private async extractLinks(): Promise<any[]> {
    if (!this.browserWindow) return [];

    try {
      const html = await this.browserWindow.webContents.executeJavaScript(
        'document.documentElement.outerHTML'
      );

      const $ = cheerio.load(html);
      const links = $('#contentScrollPaginator a');
      const linksParent: any[] = []
      const domain = new URL(this.browserWindow!.webContents.getURL()).origin
      links.each((index, element) => {
        const href = $(element).attr('href');
        const cover = $(element).find('img')?.attr('src')
        const id = href?.match(/-(\d+)(?=\/|\?)/)?.[1]
        const queryUrl = encodeURIComponent(
          `/modal/otherOffersFromSellers?product_id=${id}&page_changed=true`
        )
        const requestUrl = `${domain}/api/entrypoint-api.bx/page/json/v2?url=${queryUrl}`
        const link = `https://www.ozon.ru/product/${id}`
        const price = $(element).parent().find('.tsHeadline500Medium').text().trim().replace(/[\s\u2009₽]/g, '')
        const sourcePrice = $(element).parent().find('.tsBodyControl400Small').text().match(/[\d\s\u2009]+(?=₽)/)?.[0]?.replace(/[\s\u2009]/g, '')
        const discount = $(element).parent().find('.tsBodyControl400Small').text().trim().match(/-\d+%|\d+%/)?.[0]
        const name = $(element).parent().find('a').children('div').children('span').text()
        const rating = Number($(element).parent().find('.p6b3_0_6-a4').find('svg').next().text().match(/\d+\.\d+/)?.[0]).toFixed(1)
        const reviewCount = Number($(element).parent().find('.p6b3_0_6-a4').find('svg').next().text().match(/(\d+)\s*отзывов/)?.[1]) || 0
        if (!linksParent.map(item => item.id).includes(id)) linksParent.push({ href, price, sourcePrice, discount, link, cover, name, id, rating, sku: id, requestUrl, reviewCount })
      });
      return linksParent;
    } catch (error) {
      log.error(`${this.collectionTask.taskName}提取链接时出错:`, error);
      return [];
    }
  }

  // 处理链接，生成表格
  private async handleLink(links: any[]): Promise<void> {
    if (!links || links.length === 0) return;

    const ids = links.map(item => item.id).filter(item => item);
    if (ids.length === 0) return;
    // 创建一个异步任务，但不等待它完成
    const task = (async () => {
      this.processed += ids.length;
      this.updateStatus('running', '处理商品中...');

      try {
        await Promise.all(links.map(async item => {
          try {
            // 执行浏览器内的 fetch 请求并获取响应
            const response = await this.browserWindow!.webContents.executeJavaScript(`
          fetch(${JSON.stringify(item.requestUrl)}, { credentials: 'include' })
          .then(response => response.json())
          .then(data => ({ success: true, data: data }))
      `);

            if (response.success) {
              item.sellerNumber = JSON.parse(response.data.widgetStates?.['webSellerList-4723017-default-1'] || "{}")?.sellers?.length || 0;
            } else {
              log.error('获取跟卖人数失败');
            }
          } catch (error) {
            console.error('获取跟卖人数失败:', error);
          }
        }));
        const [res, res2] = await Promise.all([
          request({
            url: '/api/goods/hotSales/getOzonSaleDataByIds',
            method: 'post',
            data: {
              goodsIds: ids,
              v: 5
            }
          }),
          request({
            url: '/api/auto/filterGoods/goodsFilter',
            method: 'post',
            data: {
              taskId: this.collectionTask._id,
              reqDatas: links
            }
          })
        ]);

        const dataSource = new Map();

        if (res && res.data) {
          res.data.map((item: any) => ({ ...item, ...item.data })).forEach((item: any) => {
            dataSource.set(item.productId, item);
          });
        }
        if (res2 && res2.data) {
          res2.data.forEach((item: any) => {
            if (dataSource.has(item.id)) {
              const data = dataSource.get(item.id);
              dataSource.set(item.id, { ...data, ...item });
            } else {
              dataSource.set(item.id, item);
            }
          });
        }
        const tabledData = links.map(item => ({
          ...dataSource.get(item.id),
          ...item
        }))
        this.updateStatus('running', `完成${ids.length}商品的处理...`);
        this.updateStatus('running', '表格写入中...');
        this.excel?.appendAndSave(tabledData);
        this.processed -= ids.length;
        this.totalCount += tabledData.length;
        this.collectionTask.tableFilePath = this.tableFilePath
        this.updateStatus('running', '表格写入完成，已生成下载链接');
      } catch (error) {
        this.processed -= ids.length;
        this.updateStatus('running', `${ids.length}个商品处理失败...`);
        log.error(error);
      }
    })();

    // 将任务添加到挂起任务列表中，但不等待它完成
    this.addPendingTask(task);
  }

  // 过滤数据
  async filterData(data: any[]) {
    if (!data || !Array.isArray(data) || data.length === 0) {
      return [];
    }

    const task = this.collectionTask;

    // 定义过滤条件映射
    const filters = [
      // 品牌类型过滤
      (item: any) => {
        if (task?.brandType === undefined || task?.brandType === null || +task?.brandType === 2) return true;
        if (+task?.brandType === 0) return item.brand && item.brand.trim();
        if (+task?.brandType === 1) return !(item.brand && item.brand.trim());
        return true;
      },

      // 数值范围过滤 - 抽象成通用方法
      (item: any) => this.checkRange(item.soldCount, task.soldCountMin, task.soldCountMax),
      (item: any) => this.checkRange(item.gmvSum, task.gmvSumMin, task.gmvSumMax),
      (item: any) => this.checkRange(item.price, task.salePriceMin, task.salePriceMax),
      (item: any) => this.checkRange(item.weight, task.weightMin, task.weightMax),
      (item: any) => this.checkRange(item.upTimeDays, task.upGoodsTimeMin, task.upGoodsTimeMax),
      (item: any) => this.checkRange(item.salesDynamics, task.monthDynamicsMin, task.monthDynamicsMax),
      (item: any) => this.checkRange(item.drr, task.adFeeMin, task.adFeeMax),
      (item: any) => this.checkRange(item.daysInPromo, task.promotionDayMin, task.promotionDayMax),
      (item: any) => this.checkRange(item.discount, task.promotionDiscountMin, task.promotionDiscountMax),
      (item: any) => this.checkRange(item.promoRevenueShare, task.promotionDynamicsMin, task.promotionDynamicsMax),
      (item: any) => this.checkRange(item.daysWithTrafarets, task.promoteDayMin, task.promoteDayMax),
      (item: any) => this.checkRange(item.sessionCount, task.viewsMin, task.viewsMax),
      (item: any) => this.checkRange(item.convToCartPdp, task.cardRateMin, task.cardRateMax),
      (item: any) => this.checkRange(item.convToCartSearch, task.showRateMin, task.showRateMax),
      (item: any) => this.checkRange(item.sellerNumber, task.followMin, task.followMax),
      (item: any) => this.checkRange(item.myProfitMargin, task.targetProfitPercent, undefined), // 最小利润率

      // 发货模式过滤
      (item: any) => {
        if (!task.salesSchema) return true;
        const requiredModes = task.salesSchema.split(',');
        return !!(item.shippingMode && requiredModes.some((mode: string) => item.shippingMode.includes(mode)));
      }
    ];

    // 应用所有过滤条件
    return data.filter(item => filters.every(filterFn => filterFn(item)));
  }

  /**
   * 检查数值是否在范围内
   * @param value 待检查的值
   * @param min 最小值
   * @param max 最大值
   * @returns 是否符合范围
   */
  private checkRange(value: number | undefined, min?: number, max?: number): boolean {
    if (value === undefined || value === null) return true; // 空值视为通过

    // 检查最小值
    if (min !== undefined && min !== null && min > 0 && value < min) {
      return false;
    }

    // 检查最大值
    if (max !== undefined && max !== null && max > 0 && value > max) {
      return false;
    }

    return true;
  }

  // 初始化表格
  async initTable() {
    if (!this.excel) {
      log.error('表格实例初始化失败');
      return;
    }

    try {
      // 定义所有列
      const columns = [
        // 基础信息
        { header: '商品ID', key: 'id', width: 15 },
        { header: '商品链接', key: 'link', width: 30 },
        { header: '商品主图', key: 'cover', width: 20 },
        { header: '商品名称', key: 'name', width: 30 },
        { header: '商品名称（中文）', key: 'cnName', width: 30 },
        { header: '商品类目', key: 'category3', width: 20 },
        { header: '类目佣金（RFBS）', key: 'commissionRfbs', width: 15 },
        { header: '类目佣金（FBP）', key: 'commissionFbp', width: 15 },
        { header: '品牌', key: 'brand', width: 20 },
        { header: '销售价格（卢布）', key: 'price', width: 15 },
        { header: '原价（卢布）', key: 'sourcePrice', width: 15 },
        { header: '商品评分', key: 'rating', width: 10 },
        { header: '评价次数', key: 'reviewCount', width: 10 },
        { header: '跟卖人数', key: 'sellerNumber', width: 10 },
        { header: '商品创建日期', key: 'createDate', width: 15 },
        { header: '上架时间（天）', key: 'upTimeDays', width: 15 },
        { header: '发货模式', key: 'shippingMode', width: 15 },

        // 销售数据
        { header: '月销售额(卢布)', key: 'gmvSum', width: 15 },
        { header: '月销售动态(%)', key: 'salesDynamics', width: 15 },
        { header: '月销量(件)', key: 'soldCount', width: 10 },
        { header: '平均日销售额(卢布)', key: 'avgPrice', width: 15 },
        { header: '平均日销量(件)', key: 'avgDailySalesUnits', width: 10 },
        { header: '搜索和目录浏览量', key: 'sessionCountSearch', width: 15 },
        { header: '商品卡片浏览量', key: 'sessionCount', width: 15 },
        { header: '搜索和目录加购率(%)', key: 'convToCartSearch', width: 15 },
        { header: '商品卡片加购率(%)', key: 'convToCartPdp', width: 15 },
        { header: '广告份额（%）', key: 'drr', width: 10 },
        { header: '参与促销天数', key: 'daysInPromo', width: 12 },
        { header: '参与促销折扣(%)', key: 'discount', width: 15 },
        { header: '促销活动的转化率(%)', key: 'promoRevenueShare', width: 15 },
        { header: '付费推广天数', key: 'daysWithTrafarets', width: 12 },
        { header: '平均价格(卢布)', key: 'avgPrice', width: 15 },
        { header: '已错过销售(卢布)', key: 'sumMissedGmv', width: 15 },
        { header: '商品可用性(%)', key: 'accessibility', width: 15 },

        // 物流信息
        { header: '配送时间（天）', key: 'deliveryTimeDays', width: 12 },
        { header: '商品体积（升）', key: 'volume', width: 12 },
        { header: '包装长(mm)', key: 'length', width: 12 },
        { header: '包装宽(mm)', key: 'width', width: 12 },
        { header: '包装高(mm)', key: 'height', width: 12 },
        { header: '包装重量(g)', key: 'weight', width: 12 },

        // 成本和利润
        { header: 'RFBS佣金(元)', key: 'fbsPrice', width: 15 },
        { header: '国际物流', key: 'expressName', width: 15 },
        { header: '国际物流费用（元）', key: 'logisticsMoney', width: 15 },
        { header: '国内运费（元）', key: 'domesticShippingCostYuan', width: 15 },
        { header: '其他费用（提醒、货损）（元）', key: 'elsePrice', width: 20 },
        { header: '1688货源地址', key: 'sourceUrl1688', width: 30 },
        { header: '货源图片', key: 'sourceImage', width: 20 },
        { header: '货源价格（元）', key: 'sourcePriceYuan', width: 15 },
        { header: '对方利润率（%）', key: 'otherProfitPercent', width: 15 },
        { header: '对方利润（元）', key: 'otherProfit', width: 15 },
        { header: '我的售价（元）', key: 'resMoney', width: 15 },
        { header: '我的利润率（%）', key: 'myProfitMargin', width: 15 },
        { header: '我的利润（元）', key: 'myProfit', width: 15 }
      ];

      // 首先设置列定义
      await this.excel.init(); // 确保初始化完成
      this.excel.clearContent()
      // 检查是否已有列定义（即是否已有表头）
      const worksheet = this.excel.getWorksheet();
      const hasHeaders = worksheet.getRow(1).values && worksheet.getRow(1).values.length;

      if (!hasHeaders) {
        // 没有表头，设置列定义和表头
        this.excel.setColumns(columns);

        // 在第一行插入主类别标题
        const mainCategoryRowValues = Array(columns.length).fill('');
        worksheet.spliceRows(1, 0, mainCategoryRowValues);

        // 设置主类别标题
        worksheet.getCell('A1').value = '基础信息';
        worksheet.getCell('R1').value = '销售数据';
        worksheet.getCell('AJ1').value = '尺寸重量';
        worksheet.getCell('AO1').value = '我的定价';

        // 合并单元格
        this.excel.mergeCells('A1:Q1');    // 基础信息 (A1-Q1, 17列)
        this.excel.mergeCells('R1:AI1');   // 销售数据 (R1-BG1, 从第18列到第55列，共38列)
        this.excel.mergeCells('AJ1:AN1');  // 尺寸重量 (BJ1-BN1, 从第52列到第56列，共5列)
        this.excel.mergeCells('AO1:BA1');  // 我的定价 (BO1-BZ1, 从第57列到第78列，共22列)

        // 设置表头样式 - 只设置第1行（主类别标题）
        this.excel.setRowStyle(1, {
          font: { bold: true, size: 12 },
          alignment: { vertical: 'middle', horizontal: 'center' },
          fill: {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'fff3ca' }
          }
        });

        // 设置第2行作为具体列标题行
        const headerRow = worksheet.getRow(2);
        columns.forEach((col, index) => {
          headerRow.getCell(index + 1).value = col.header;
        });

        this.excel.setRowStyle(2, {
          font: { bold: true, size: 10 },
          alignment: { vertical: 'middle', horizontal: 'center' },
          fill: {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'd9d9d9' }
          }
        });

        log.info('Excel 表头初始化完成');
      } else {
        log.info('Excel 表头已存在，跳过初始化');
      }
    } catch (error) {
      log.error('初始化 Excel 表头失败:', error);
    }
  }

  // 终止任务
  async cancel() {
    if (this.browserWindow) {
      this.browserWindow.close();
      this.browserWindow = null;
      this.timers.forEach(item => clearTimeout(item));
    }

    // 确保 Excel 数据已保存
    if (this.excel) {
      await this.excel.flushToDisk();
    }

    // 取消所有挂起的任务
    this.pendingTasks.forEach(task => {
      // 对于普通的 Promise，我们无法直接取消，但可以标记状态
    });

    this.updateStatus('cancelled', '任务已取消');
  }


  async run(): Promise<Task> {
    try {
      await this.initTable();
      this.updateStatus('running', '任务开始执行...');

      await this.createCollectionWindow();

      // 等待所有挂起的数据处理任务完成
      await this.waitForAllPendingTasks();

      // 任务执行完成后关闭窗口
      if (this.browserWindow) {
        this.browserWindow.close();
        this.browserWindow = null;
        this.processed = 0;
        this.updateStatus('completed', '任务完成...');
      }

      return this.collectionTask;
    } catch (error) {
      log.error(`${this.collectionTask.taskName}任务执行失败`, error);

      // 关闭窗口
      if (this.browserWindow) {
        this.browserWindow.close();
        this.browserWindow = null;
      }

      // 等待所有挂起的数据处理任务完成，即使出现错误
      try {
        await this.waitForAllPendingTasks();
      } catch (taskError) {
        log.error('等待数据处理任务完成时出错', taskError);
      }

      this.updateStatus('failed', `任务执行失败: ${error instanceof Error ? error.message : '未知错误'}`);
      return this.collectionTask;
    }
  }
}