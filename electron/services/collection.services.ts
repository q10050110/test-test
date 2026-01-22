import request from '../utils/request.js';
import dayjs from 'dayjs';
import { join } from 'path';
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
  tableFilePath: string = '';
  private pendingTasks: Promise<any>[] = [];
  private processedIds: Set<string> = new Set();
  constructor(task: Task, mainWindow: BrowserWindow) {
    this.collectionTask = { ...task };
    this.mainWindow = mainWindow;
    this.excel = new ExcelWriter(join(excelDir, `${this.collectionTask.taskName}.xlsx`));
    this.tableFilePath = join(excelDir, `${this.collectionTask.taskName}.xlsx`);
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
    this.collectionTask.taskStatus = status;
    this.collectionTask.createTime = createTime;
  }

  // 更新任务数据
  updateTaskData(task: Partial<Task>) {
    // 只更新允许更新的字段，保留原始的 id、createTime 等
    Object.assign(this.collectionTask, {
      ...task,
      _id: this.collectionTask._id, // 确保 id 不被覆盖
      createTime: this.collectionTask.createTime, // 确保创建时间不被覆盖
      taskStatus: this.collectionTask.taskStatus, // 保持当前状态
    });
  }

  // 输出日志
  outputLog(taskLog: string) {
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
  }

  // 更新任务状态
  async updateStatus(status: TaskStatus) {
    try {
      this.collectionTask.taskStatus = status;
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
          taskId: this.collectionTask._id,
          taskStatus: status,
        },
      })
    } catch (error) {

    }
  }

  // 重置任务状态（用于重新执行）
  async resetTask() {
    this.collectionTask.progress = {};
    this.processed = 0
    this.totalCount = 0
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
      // 监听窗口关闭事件
      this.browserWindow.on('closed', () => {
        if (this.collectionTask.taskStatus !== 'completed') {
          this.updateStatus('failed')
          this.outputLog('窗口异常关闭')
          this.pendingTasks = []
          reject(new Error('窗口异常关闭'))
        }
        this.browserWindow = null;
        resolve()
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
    this.outputLog('正在解析页面数据')
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

  // 根据目标数量收集链接
  private async collectLinksByTargetCount(targetCount: number) {
    if (!this.browserWindow) return [];
    // 清除之前的挂起任务
    this.pendingTasks = [];
    let scrollAttempts = 0;
    const maxScrollAttempts = 30; // 最大尝试次数
    this.outputLog(`开始采集链接，目标数量: ${targetCount}`);
    // 等待页面加载 
    await this.delay(2000);
    // 获取初始链接
    const initialLinks = (await this.extractLinks())?.slice(0, targetCount) || [];
    this.collectedLinks = [...initialLinks];
    if (initialLinks.length) {
      this.handleLink(initialLinks);
    }
    await this.outputLog(`初始加载 ${this.collectedLinks.length} 个链接`);
    // 如果还没达到目标数量，继续滚动加载
    while (this.collectedLinks.length < targetCount && scrollAttempts < maxScrollAttempts) {
      const previousLength = this.collectedLinks.length;
      if (this.collectionTask.taskStatus === 'cancelled') {
        console.log('退出函数！');
        return;
      }
      // 随机延迟
      const randomDelay = this.getRandomDelay(2000, 4000);
      this.outputLog(`滚动加载中... (${scrollAttempts + 1}/${maxScrollAttempts})，已收集: ${Math.min(previousLength, +targetCount)}/${targetCount}`);
      await this.delay(randomDelay);
      // 执行滚动操作 - 滚动整个页面
      const scrollSuccess = await this.performScroll();
      if (!scrollSuccess) {
        log.info('滚动操作未成功执行，可能已到达底部');
        break;
      }
      await this.delay(2000);
      // 提取新链接 - 从指定容器提取
      const newLinks = await this.extractLinks();
      const uniqueNewLinks = newLinks.filter(item => !this.collectedLinks.map(obj => obj.id).includes(item.id)).slice(0, targetCount - previousLength > 0 ? targetCount - previousLength : 0);

      if (uniqueNewLinks.length > 0) {
        this.collectedLinks = [...this.collectedLinks, ...uniqueNewLinks];
        this.handleLink(uniqueNewLinks); // 不等待，继续执行
      }
      this.outputLog(`已收集 ${this.collectedLinks.length} / ${targetCount} 个链接`);
      // 判断是否需要继续滚动
      if (this.collectedLinks.length === previousLength) {
        log.info('本次滚动未发现新链接');
        this.outputLog('本次滚动未发现新链接')
        scrollAttempts++;
      } else {
        scrollAttempts = 0; // 有新链接，重置尝试次数
      }
      // 如果已达到目标数量，停止滚动
      if (this.collectedLinks.length >= targetCount) {
        break;
      }
    }
    this.outputLog(`收集完成，共收集到 ${Math.min(this.collectedLinks.length, +this.collectionTask.targetCount)} 个链接`);
    this.collectedLinks = this.collectedLinks.slice(0, targetCount)
    return this.collectedLinks
  }

  // 执行滚动操作 - 滚动整个页面窗口
  private async performScroll(): Promise<boolean> {
    if (!this.browserWindow || this.browserWindow.isDestroyed()) return false;
    try {
      const result = await this.browserWindow.webContents.executeJavaScript(`
  (function () {
    return new Promise(resolve => {
      const startY = window.scrollY;
      const windowHeight = window.innerHeight;
      const documentHeight = document.documentElement.scrollHeight;

      const scrollAmount = Math.floor(windowHeight * 0.8);
      const targetY = Math.min(
        startY + scrollAmount,
        documentHeight - windowHeight
      );

      if (startY >= documentHeight - windowHeight - 10) {
        resolve(false);
        return;
      }

      const duration = 600; // 滚动时长 ms
      const startTime = performance.now();

      function step(now) {
        const progress = Math.min((now - startTime) / duration, 1);
        const ease = progress < 0.5
          ? 2 * progress * progress
          : 1 - Math.pow(-2 * progress + 2, 2) / 2;

        window.scrollTo(0, startY + (targetY - startY) * ease);

        if (progress < 1) {
          requestAnimationFrame(step);
        } else {
          resolve(true);
        }
      }

      requestAnimationFrame(step);
    });
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
    if (!this.browserWindow || this.browserWindow.isDestroyed()) return [];
    try {
      const html = await this.browserWindow.webContents.executeJavaScript(
        'document.documentElement.outerHTML'
      );
      const $ = cheerio.load(html);
      const links = $('#contentScrollPaginator a');
      const linksParent: any[] = []
      const domain = new URL(this.browserWindow!.webContents.getURL()).origin
      // 解析DOM，获取商品数据
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
        const oPrice = $(element).parent().find('.tsBodyControl400Small').text().match(/[\d\s\u2009]+(?=₽)/)?.[0]?.replace(/[\s\u2009]/g, '')
        const sourcePrice = 0
        const discount = $(element).parent().find('.tsBodyControl400Small').text().trim().match(/-\d+%|\d+%/)?.[0]
        const name = $(element).parent().find('a').children('div').children('span').text()
        const rating = Number($(element).parent().find('.p6b3_0_6-a4').find('svg').next().text().match(/\d+\.\d+/)?.[0]).toFixed(1)
        const reviewCount = Number($(element).parent().find('.p6b3_0_6-a4').find('svg').next().text().match(/(\d+)\s*отзывов/)?.[1]) || 0
        if (!linksParent.map(item => item.id).includes(id)) linksParent.push({ href, price: Number(price), sourcePrice: Number(sourcePrice), oPrice, discount, link, cover, name, id, rating, sku: id, requestUrl, reviewCount })
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
    // 检查窗口是否存在且未被销毁
    if (this.checkBrowserAlice()) return;
    // 过滤出未处理的链接
    const unprocessedLinks = links.filter(item => item.id && !this.processedIds.has(item.id));

    if (unprocessedLinks.length === 0) {
      this.outputLog(`跳过 ${links.length} 个已处理的商品`);
      return;
    }

    const ids = unprocessedLinks.map(item => item.id);
    const task = (async () => {
      this.processed += ids.length;
      this.outputLog(`获取 ${ids.length} 个商品数据中...`);
      try {
        await Promise.all(unprocessedLinks.map(async item => {
          if (this.checkBrowserAlice()) return;
          try {
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
            log.error(`获取商品 ${item.id} 的跟卖人数失败:`, error);
          }
        }));

        // 获取商品详细数据
        const res = await request({
          url: '/api/goods/hotSales/getOzonSaleDataByIds',
          method: 'post',
          data: {
            goodsIds: ids,
            v: 5
          }
        });

        // 整合数据并应用过滤
        const integratedData = await this.integrateAndFilterData(unprocessedLinks, res.data || []);

        if (integratedData.length > 0) {
          this.outputLog(`完成${integratedData.length}个商品的处理...`);
          this.outputLog('表格写入中...');

          // 标记这些ID为已处理
          integratedData.forEach(item => {
            this.processedIds.add(item.id);
          });

          // 写入Excel
          const res = await this.excel?.appendAndSave(integratedData);
          console.log(res, '表格写入状态')
          this.totalCount += integratedData.length;
          this.collectionTask.tableFilePath = this.tableFilePath;
          if (!res) return this.outputLog(`输出表格文件处于编辑状态中，写入失败...`)
          this.outputLog(`表格写入完成，新增 ${integratedData.length} 条记录`);
        } else {
          this.outputLog(`经过过滤后无符合条件的商品`);
        }

      } catch (error) {
        log.error(`${this.collectionTask.taskName} 处理商品数据时出错:`, error);
        this.outputLog(`部分商品处理失败: ${error || '未知错误'}`);
      } finally {
        this.processed -= ids.length;
      }
    })();

    this.addPendingTask(task);
  }

  // 新增：整合和过滤数据的方法
  private async integrateAndFilterData(links: any[], apiData: any[]): Promise<any[]> {
    try {
      // 将API数据转换为Map以便快速查找
      const apiDataMap = new Map();
      (apiData.map((item: any) => ({ ...item, ...item.data })) || []).forEach(item => {
        if (item.goods_id) {
          apiDataMap.set(item.goods_id, item);
        }
      });

      // 整合链接数据和API数据
      const integratedData = links.map(link => {
        const apiItem = apiDataMap.get(link.id);
        if (apiItem) {
          return { ...link, ...apiItem, productId: link.id };
        }
        return { ...link, productId: link.id };
      });

      // 应用过滤条件
      const filteredData = await this.filterData(integratedData);

      // 进一步整合来自第二个API的数据
      const finalIntegratedData = await this.integrateAdditionalData(filteredData);

      // 格式化日期
      return finalIntegratedData.map(item => ({
        ...item,
        createDate: dayjs(item.createDate).format('YYYY-MM-DD HH:mm:ss')
      }));
    } catch (error) {
      log.error('整合数据时出错:', error);
      return [];
    }
  }

  // 新增：整合额外数据的方法
  private async integrateAdditionalData(filteredData: any[]): Promise<any[]> {
    try {
      const res2 = await request({
        url: '/api/auto/filterGoods/goodsFilter',
        method: 'post',
        data: {
          taskId: this.collectionTask._id,
          reqDatas: filteredData
        }
      });

      if (res2 && res2.data) {
        const additionalDataMap = new Map();
        res2.data.forEach((item: any) => {
          additionalDataMap.set(item.id, item);
        });

        // 合并数据
        return filteredData.map(item => {
          const additionalData = additionalDataMap.get(item.id);
          if (additionalData) {
            return { ...item, ...additionalData };
          }
          return item;
        });
      }

      return filteredData;
    } catch (error) {
      log.error('获取额外数据时出错:', error);
      return filteredData;
    }
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

      // 销量范围校验
      (item: any) => {
        const result = this.checkRange(item.soldCount, task.soldCountMin, task.soldCountMax);
        //log.info(`销量范围校验 - 商品ID: ${item._id}, 实际销量: ${item.soldCount}, 范围: [${task.soldCountMin}, ${task.soldCountMax}], 结果: ${result}`);
        return result;
      },

      // 月销售额范围校验
      (item: any) => {
        const result = this.checkRange(item.gmvSum, task.gmvSumMin, task.gmvSumMax);
        //log.info(`月销售额范围校验 - 商品ID: ${item._id}, 实际销售额: ${item.gmvSum}, 范围: [${task.gmvSumMin}, ${task.gmvSumMax}], 结果: ${result}`);
        return result;
      },

      // 销售价格范围校验
      (item: any) => {
        const result = this.checkRange(item.price, task.salePriceMin, task.salePriceMax);
        //log.info(`销售价格范围校验 - 商品ID: ${item._id}, 实际价格: ${item.price}, 范围: [${task.salePriceMin}, ${task.salePriceMax}], 结果: ${result}`);
        return result;
      },

      // 重量范围校验
      (item: any) => {
        const result = this.checkRange(item.weight, task.weightMin, task.weightMax);
        //log.info(`重量范围校验 - 商品ID: ${item._id}, 实际重量: ${item.weight}, 范围: [${task.weightMin}, ${task.weightMax}], 结果: ${result}`);
        return result;
      },

      // 上架时间范围校验
      (item: any) => {
        const result = this.checkRange(item.upTimeDays, task.upGoodsTimeMin, task.upGoodsTimeMax);
        // log.info(`上架时间范围校验 - 商品ID: ${item._id}, 实际天数: ${item.upTimeDays}, 范围: [${task.upGoodsTimeMin}, ${task.upGoodsTimeMax}], 结果: ${result}`);
        return result;
      },

      // 月销售动态范围校验
      (item: any) => {
        const result = this.checkRange(item.salesDynamics, task.monthDynamicsMin, task.monthDynamicsMax);
        // log.info(`月销售动态范围校验 - 商品ID: ${item._id}, 实际动态: ${item.salesDynamics}, 范围: [${task.monthDynamicsMin}, ${task.monthDynamicsMax}], 结果: ${result}`);
        return result;
      },

      // 广告份额范围校验
      (item: any) => {
        const result = this.checkRange(item.drr, task.adFeeMin, task.adFeeMax);
        // log.info(`广告份额范围校验 - 商品ID: ${item._id}, 实际份额: ${item.drr}, 范围: [${task.adFeeMin}, ${task.adFeeMax}], 结果: ${result}`);
        return result;
      },

      // 参与促销天数范围校验
      (item: any) => {
        const result = this.checkRange(item.daysInPromo, task.promotionDayMin, task.promotionDayMax);
        // log.info(`参与促销天数范围校验 - 商品ID: ${item._id}, 实际天数: ${item.daysInPromo}, 范围: [${task.promotionDayMin}, ${task.promotionDayMax}], 结果: ${result}`);
        return result;
      },

      // 参与促销折扣范围校验
      (item: any) => {
        const result = this.checkRange(item.discount, task.promotionDiscountMin, task.promotionDiscountMax);
        // log.info(`参与促销折扣范围校验 - 商品ID: ${item._id}, 实际折扣: ${item.discount}, 范围: [${task.promotionDiscountMin}, ${task.promotionDiscountMax}], 结果: ${result}`);
        return result;
      },

      // 促销活动转化率范围校验
      (item: any) => {
        const result = this.checkRange(item.promoRevenueShare, task.promotionDynamicsMin, task.promotionDynamicsMax);
        // log.info(`促销活动转化率范围校验 - 商品ID: ${item._id}, 实际转化率: ${item.promoRevenueShare}, 范围: [${task.promotionDynamicsMin}, ${task.promotionDynamicsMax}], 结果: ${result}`);
        return result;
      },

      // 付费推广天数范围校验
      (item: any) => {
        const result = this.checkRange(item.daysWithTrafarets, task.promoteDayMin, task.promoteDayMax);
        // log.info(`付费推广天数范围校验 - 商品ID: ${item._id}, 实际天数: ${item.daysWithTrafarets}, 范围: [${task.promoteDayMin}, ${task.promoteDayMax}], 结果: ${result}`);
        return result;
      },

      // 浏览量范围校验
      (item: any) => {
        const result = this.checkRange(item.sessionCount, task.viewsMin, task.viewsMax);
        // log.info(`浏览量范围校验 - 商品ID: ${item._id}, 实际浏览量: ${item.sessionCount}, 范围: [${task.viewsMin}, ${task.viewsMax}], 结果: ${result}`);
        return result;
      },

      // 商品卡片加购率范围校验
      (item: any) => {
        const result = this.checkRange(item.convToCartPdp, task.cardRateMin, task.cardRateMax);
        // log.info(`商品卡片加购率范围校验 - 商品ID: ${item._id}, 实际加购率: ${item.convToCartPdp}, 范围: [${task.cardRateMin}, ${task.cardRateMax}], 结果: ${result}`);
        return result;
      },

      // 搜索和目录加购率范围校验
      (item: any) => {
        const result = this.checkRange(item.convToCartSearch, task.showRateMin, task.showRateMax);
        // log.info(`搜索和目录加购率范围校验 - 商品ID: ${item._id}, 实际加购率: ${item.convToCartSearch}, 范围: [${task.showRateMin}, ${task.showRateMax}], 结果: ${result}`);
        return result;
      },

      // 跟卖人数范围校验
      (item: any) => {
        const result = this.checkRange(item.sellerNumber, task.followMin, task.followMax);
        // log.info(`跟卖人数范围校验 - 商品ID: ${item._id}, 实际人数: ${item.sellerNumber}, 范围: [${task.followMin}, ${task.followMax}], 结果: ${result}`);
        return result;
      },

      // 最小利润率校验
      (item: any) => {
        const result = this.checkRange(item.myProfitMargin, task.targetProfitPercent, undefined);
        // log.info(`最小利润率校验 - 商品ID: ${item.goods}, 实际利润率: ${item.myProfitMargin}, 最低要求: ${task.targetProfitPercent}, 结果: ${result}`);
        return result;
      },

      // 发货模式过滤
      /*       (item: any) => {
              if (!task.salesSchema) {
                log.info(`发货模式校验 - 任务未设置发货模式要求，商品ID: ${item._id}, 结果: true`);
                return true;
              }
              const requiredModes = task.salesSchema.split(',');
              const result = !!(item.shippingMode && requiredModes.some((mode: string) => item.shippingMode.includes(mode)));
              log.info(`发货模式校验 - 商品ID: ${item._id}, 实际模式: ${item.shippingMode}, 要求模式: ${requiredModes.join(',')}, 结果: ${result}`);
              return result;
            } */
    ];

    // log.info(`开始过滤数据，共 ${data.length} 条商品记录`);

    // 应用所有过滤条件
    const filteredData = data.filter(item => {
      const results = filters.map(filterFn => filterFn(item));
      const overallResult = results.every(r => r);

      if (!overallResult) {
        // log.info(`商品ID ${item._id} 未通过过滤，各规则结果: [${results.join(', ')}]`);
      }

      return overallResult;
    });

    // log.info(`数据过滤完成，原始数量: ${data.length}, 过滤后数量: ${filteredData.length}`);

    return filteredData;
  }

  /**
   * 检查数值是否在范围内
   * @param value 待检查的值
   * @param min 最小值
   * @param max 最大值
   * @returns 是否符合范围
   */
  private checkRange(value: number | string | undefined | null, min?: number, max?: number): boolean {
    // 将值转换为数字类型
    let numValue: number | null = null;
    if (min === 0 && max === 0) return true
    if (typeof value === 'string') {
      numValue = Number(value);
    } else if (typeof value === 'number') {
      numValue = value;
    } else if (typeof value === 'undefined') {
      numValue = 0
    } else {
      numValue = Number(value);
    }

    // 如果转换后不是有效数字，返回 false
    if (isNaN(numValue)) {
      return false;
    }

    // 检查最小值
    if (min !== undefined && min !== null && min > 0 && numValue < min) {
      return false;
    }

    // 检查最大值
    if (max !== undefined && max !== null && max > 0 && numValue > max) {
      return false;
    }

    return true;
  }
  setFilePath() {
    this.collectionTask.tableFilePath = this.tableFilePath
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
        { header: '原价（卢布）', key: 'oPrice', width: 15 },
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
        { header: '货源价格（元）', key: 'sourcePrice', width: 15 },
        { header: '对方利润率（%）', key: 'otherProfitPercent', width: 15 },
        { header: '对方利润（元）', key: 'otherProfit', width: 15 },
        { header: '我的售价（元）', key: 'resMoney', width: 15 },
        { header: '我的利润率（%）', key: 'myProfitMargin', width: 15 },
        { header: '我的利润（元）', key: 'myProfit', width: 15 }
      ];

      // 首先设置列定义
      await this.excel.init();
      await this.excel.clearContent()
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
    this.timers.forEach(timer => {
      if (timer) {
        clearTimeout(timer);
      }
    });
    this.timers = [];
    if (this.browserWindow) {
      this.browserWindow.close();
      this.browserWindow = null;
    }
    // 确保 Excel 数据已保存
    if (this.excel) {
      await this.excel.flushToDisk();
    }
    // 取消所有挂起的任务
    this.pendingTasks.forEach(task => {
    });
    this.updateStatus('cancelled');
    this.outputLog('任务已取消')
  }

  // 检查浏览器是否存活
  checkBrowserAlice() {
    if (!this.browserWindow || this.browserWindow.isDestroyed()) {
      this.updateStatus('failed')
      this.outputLog('浏览器窗口已被销毁，跳过链接处理')
      log.warn('浏览器窗口已被销毁，跳过链接处理');
      return true
    }
    return false
  }
  async run(): Promise<Task> {
    try {
      await this.initTable();
      this.updateStatus('running')
      this.outputLog('开始执行任务...')
      await this.createCollectionWindow();
      // 等待所有挂起的数据处理任务完成
      await this.waitForAllPendingTasks();
      // 任务执行完成后关闭窗口
      if (this.browserWindow) {
        this.browserWindow.close();
        this.browserWindow = null;
        this.processed = 0;
        this.updateStatus('completed')
        this.outputLog('任务执行完成')
      }
      return this.collectionTask;
    } catch (error) {
      log.error(`${this.collectionTask.taskName}任务执行失败`, error);
      this.updateStatus('failed');
      this.outputLog(`任务执行失败:${error}`)
      return this.collectionTask;
    }
  }
}