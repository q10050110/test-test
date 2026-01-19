import request from '../utils/request.js';
import dayjs from 'dayjs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import { BrowserWindow } from 'electron';
import * as cheerio from 'cheerio';
import log from '../log/index.js';
export type TaskStatus = 'noExecuted' | 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
import { ExcelWriter } from '../utils/excel.js';

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
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class Collection {
  private collectionTask: Task;
  private browserWindow: BrowserWindow | null = null;
  private mainWindow: BrowserWindow;
  private excel: ExcelWriter | null = null;
  private extractedLinks: string[] = []; // 提取的链接
  private collectedLinks: string[] = []; // 累计爬取
  private processed: number = 0
  private timers: NodeJS.Timeout[] = [];
  // 用于避免重复状态更新
  private lastServerStatus: TaskStatus | null = null;
  private tableFilePath: string | null = null

  constructor(task: Task, mainWindow: BrowserWindow) {
    this.collectionTask = { ...task }; // 深拷贝任务对象
    this.mainWindow = mainWindow;
    this.excel = new ExcelWriter(join(__dirname, '../public/excel/', `${this.collectionTask.taskName}.xlsx`));
    this.lastServerStatus = task.taskStatus;
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
    this.collectionTask.updateTime = dayjs(Date.now()).format('YYYY-MM-DD HH:mm:ss');
    this.extractedLinks = [];
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
    return new Promise<void>((resolve, reject) => {
      this.browserWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        show: true,
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

    let scrollAttempts = 0;
    const maxScrollAttempts = 30; // 增加最大尝试次数

    this.updateStatus('running', `开始采集链接，目标数量: ${targetCount}`);

    // 等待页面加载 
    await this.delay(2000);

    // 获取初始链接
    const initialLinks = await this.extractLinks();
    this.collectedLinks = [...initialLinks];
    if (initialLinks.length) this.handleLink(initialLinks)
    await this.updateStatus('running', `初始加载 ${this.collectedLinks.length} 个链接`);

    // 如果还没达到目标数量，继续滚动加载
    while (this.collectedLinks.length < targetCount && scrollAttempts < maxScrollAttempts) {

      const previousLength = this.collectedLinks.length;
      console.log(this.collectionTask.taskStatus, '任务状态')
      if (this.collectionTask.taskStatus === 'cancelled') {
        console.log('退出函数！')
        return
      };
      // 随机延迟，模拟人类行为
      const randomDelay = this.getRandomDelay(1000, 2000);
      this.updateStatus('running', `滚动加载中... (${scrollAttempts + 1}/${maxScrollAttempts})，已收集: ${this.collectedLinks.length}/${targetCount}`);

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
      const uniqueNewLinks = newLinks.filter(link => !this.collectedLinks.includes(link));

      if (uniqueNewLinks.length > 0) {
        this.collectedLinks = [...this.collectedLinks, ...uniqueNewLinks];
        this.handleLink(uniqueNewLinks)
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

    this.updateStatus('running', `任务完成，共收集到 ${this.collectedLinks.length} 个链接`);

    return this.collectedLinks.slice(0, targetCount);
  }

  // 处理链接
  private async handleLink(links: string[]) {
    const ids: any[] = []
    this.processed = ids.length
    for (const link of links) {
      const id = link.match(/-(\d+)(?=\/|\?)/)?.[1] || null
      ids.push(id)
    }
    try {
      const res = await request({
        url: '/api/goods/hotSales/getOzonSaleDataByIds',
        method: 'post',
        data: {
          type: 1,
          cellectUrl: this.collectionTask.targetUrl,
          goodsIds: ids,
          saleFilterForm: {}
        }
      })
      this.processed = 0
      log.info('获取商品数据成功', res.data)
      const data = res.data.map((item: any) => ({ productId: item.goods_id, ...item, ...item.data }))
      this.excel?.appendAndSave(data)
    } catch (error) {
      log.error('获取商品数据失败', error)
    }
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

  // 提取链接
  private async extractLinks(): Promise<string[]> {
    if (!this.browserWindow) return [];

    try {
      const html = await this.browserWindow.webContents.executeJavaScript(
        'document.documentElement.outerHTML'
      );

      const $ = cheerio.load(html);
      const links = $('#contentScrollPaginator a');

      links.each((index, element) => {
        const href = $(element).attr('href');
        if (href) {
          const absoluteHref = this.ensureAbsoluteUrl(href, this.collectionTask.targetUrl);
          if (!this.extractedLinks.includes(absoluteHref)) {
            this.extractedLinks.push(absoluteHref);
          }
        }
      });

      return this.extractedLinks;
    } catch (error) {
      log.error(`${this.collectionTask.taskName}提取链接时出错:`, error);
      return [];
    }
  }

  // 导出表格
  async initTable() {
    if (!this.excel) log.error('表格实例初始化失败')
    // 定义所有列
    const columns = [
      // 基础信息
      { header: '商品ID', key: 'productId' },
      { header: '商品链接', key: 'productLink' },
      { header: '商品主图', key: 'productImage' },
      { header: '商品名称', key: 'productName' },
      { header: '商品名称（中文）', key: 'productNameZh' },
      { header: '商品类目', key: 'category' },
      { header: '类目佣金（RFBS）', key: 'commissionRfbs' },
      { header: '类目佣金（FBP）', key: 'commissionFbp' },
      { header: '品牌', key: 'brand' },

      // 价格信息
      { header: '销售价格（卢布）', key: 'salePriceRub' },
      { header: '原价（卢布）', key: 'originalPriceRub' },
      { header: '商品评分', key: 'rating' },
      { header: '评价次数', key: 'reviewCount' },
      { header: '跟卖人数', key: 'competitorCount' },
      { header: '商品创建日期', key: 'creationDate' },
      { header: '上架时间（天）', key: 'daysOnShelf' },
      { header: '发货模式', key: 'shippingMode' },

      // 销售数据
      { header: '月销售额(卢布)', key: 'monthlyRevenueRub' },
      { header: '月销售动态(%)', key: 'monthlyDynamicsPercent' },
      { header: '月销量(件)', key: 'monthlySalesUnits' },
      { header: '平均日销售额(卢布)', key: 'avgDailyRevenueRub' },
      { header: '平均日销量(件)', key: 'avgDailySalesUnits' },
      { header: '搜索和目录浏览量', key: 'searchViews' },
      { header: '商品卡片浏览量', key: 'cardViews' },
      { header: '搜索和目录加购率(%)', key: 'searchAddToCartRate' },
      { header: '商品卡片加购率(%)', key: 'cardAddToCartRate' },
      { header: '广告份额（%）', key: 'adSharePercent' },
      { header: '参与促销天数', key: 'promotionDays' },
      { header: '参与促销折扣(%)', key: 'promotionDiscount' },
      { header: '促销活动的转化率(%)', key: 'promotionConversionRate' },
      { header: '付费推广天数', key: 'paidAdDays' },
      { header: '平均价格(卢布)', key: 'avgPriceRub' },
      { header: '已错过销售(卢布)', key: 'missedSalesRub' },
      { header: '商品可用性(%)', key: 'availabilityPercent' },

      // 物流信息
      { header: '配送时间（天）', key: 'deliveryTimeDays' },
      { header: '商品体积（升）', key: 'volumeLiters' },
      { header: '包装长(mm)', key: 'packageLengthMm' },
      { header: '包装宽(mm)', key: 'packageWidthMm' },
      { header: '包装高(mm)', key: 'packageHeightMm' },
      { header: '包装重量(g)', key: 'packageWeightG' },

      // 成本和利润
      { header: 'RFBS佣金(元)', key: 'rfbsCommissionYuan' },
      { header: '国际物流', key: 'internationalLogistics' },
      { header: '国际物流费用（元）', key: 'internationalLogisticsCostYuan' },
      { header: '国内运费（元）', key: 'domesticShippingCostYuan' },
      { header: '其他费用（提醒、货损）（元）', key: 'otherCostsYuan' },
      { header: '1688货源地址', key: 'sourceUrl1688' },
      { header: '货源图片', key: 'sourceImage' },
      { header: '货源价格（元）', key: 'sourcePriceYuan' },
      { header: '对方利润率（%）', key: 'competitorProfitMargin' },
      { header: '对方利润（元）', key: 'competitorProfitYuan' },
      { header: '我的售价（元）', key: 'mySellingPriceYuan' },
      { header: '我的利润率（%）', key: 'myProfitMargin' },
      { header: '我的利润（元）', key: 'myProfitYuan' }
    ];

    if (this.excel) {
      // 首先设置列定义
      this.excel.setColumns(columns);

      // 然后插入第一行作为主类别标题行
      // 插入空的第一行
      const mainCategoryRowValues = Array(columns.length).fill('');
      const worksheet = this.excel.getWorksheet(); // 使用公共方法获取worksheet

      // 在第一行插入主类别标题
      worksheet.spliceRows(1, 0, mainCategoryRowValues);

      // 设置主类别标题
      worksheet.getCell('A1').value = '基础信息';
      worksheet.getCell('R1').value = '销售数据';
      worksheet.getCell('BJ1').value = '尺寸重量';
      worksheet.getCell('BO1').value = '我的定价';

      // 合并单元格
      this.excel.mergeCells('A1:Q1');    // 基础信息 (A1-Q1, 17列)
      this.excel.mergeCells('R1:BG1');   // 销售数据 (R1-BG1, 从第18列到第55列，共38列)
      this.excel.mergeCells('BJ1:BN1');  // 尺寸重量 (BJ1-BN1, 从第52列到第56列，共5列)
      this.excel.mergeCells('BO1:BZ1');  // 我的定价 (BO1-BZ1, 从第57列到第78列，共22列)

      // 设置表头样式
      this.excel.setRowStyle(1, {
        font: { bold: true, size: 12 },
        alignment: { vertical: 'middle', horizontal: 'center' },
        fill: {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'E0E0E0' }
        }
      });

      this.excel.setRowStyle(2, {
        font: { bold: true, size: 10 },
        alignment: { vertical: 'middle', horizontal: 'center' },
        fill: {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'F0F0F0' }
        }
      });
    }

    this.tableFilePath = await this.excel!.save()
    log.info('创建表格：', this.tableFilePath)
  }

  // 终止任务
  async cancel() {
    if (this.browserWindow) {
      this.browserWindow.close();
      this.browserWindow = null;
      this.timers.forEach(item => clearTimeout(item))
    }
    this.updateStatus('cancelled', '任务已取消');
  }

  async run(): Promise<Task> {
    try {
      await this.initTable()
      this.updateStatus('running', '任务开始执行...');

      await this.createCollectionWindow();


      // 任务执行完成后关闭窗口
      if (this.browserWindow) {
        this.browserWindow.close();
        this.browserWindow = null;
        this.updateStatus('completed', '任务完成...')
      }

      return this.collectionTask;
    } catch (error) {
      log.error(`${this.collectionTask.taskName}任务执行失败`, error);
      // 关闭窗口
      if (this.browserWindow) {
        this.browserWindow.close();
        this.browserWindow = null;
      }
      this.updateStatus('failed', `任务执行失败: ${error instanceof Error ? error.message : '未知错误'}`);
      return this.collectionTask;
    }
  }
}