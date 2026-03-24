import request from '../../utils/request.js'
import { Task } from './type.js'
import dayjs from 'dayjs'
export class DataProcessService {
  private data: Map<string, any> = new Map()
  constructor() { }
  /**
   * 获取基础数据
   */
  async getBaseData(data: any[]) {
    for (const item of data) {
      const cached = this.data.get(item.id)
      if (cached) {
        const merge = { ...cached, ...item }
        this.data.set(item.id, merge)
        continue
      }
    }

    try {
      const res = await request({
        url: '/api/goods/hotSales/getOzonSaleDataByIds',
        method: 'post',
        data: {
          goodsIds: data.map((item: any) => item.id),
          v: 5,
        },
      })

      if (res.data) {
        res.data
          .map((item: any) => ({ ...item, ...item.data }))
          .forEach((item: any) => {
            item.nullableCreateDate = dayjs(item.nullableCreateDate).format('YYYY-MM-DD')
            item.releaseDate = dayjs().diff(dayjs(item.nullableCreateDate), 'day')
            item.commissionRfbs = `<=1500卢布：${item.rfbs_small || 0}% 1501~5000卢布: ${item.rfbs || 0}% >5000卢布：${item.rfbs_large || 0}%`
            item.commissionFbp = `<=1500卢布：${item.fbp_small || 0}% 1501~5000卢布: ${item.fbp || 0}% >5000卢布：${item.fbp_large || 0}%`
            item.discount = item?.discount?.toFixed(2)
            if (item.accessibility) item.accessibility = item.accessibility * 100
            if (item.goods_id) this.data.set(item.goods_id, item)
            if (item.brand) item.brand = item.brand?.includes('без бренда') ? '' : item.brand
            item.length = undefined
            item.weight = undefined
            item.height = undefined
          })
      }

      const mergeData = data.map((item) => {
        const obj = this.data.get(item.id)
        if (obj) {
          return { ...item, ...obj, productId: item.id }
        }

        return { ...item, productId: item.id }
      })
      return mergeData
    } catch (error) {
      throw new Error('获取基础数据失败')
    }
  }

  /**
   * 获取中文名
   */
  async getChineseName(text: string) {
    try {
      const res = await request({
        url: '/api/other/fanyi/translateText',
        method: 'post',
        data: {
          text,
          from: 'ru',
          to: 'zh',
        },
      })
      return res.data
    } catch (error) {
      return text
    }
  }
  /**
   * 获取详细数据
   */
  async getDetailData(params: { taskId: string; reqDatas: any[] }) {
    try {
      const { taskId, reqDatas } = params
      const res = await request({
        url: '/api/auto/filterGoods/goodsFilter',
        method: 'post',
        data: {
          taskId,
          reqDatas,
        },
      })

      let item = res.data[0]
      const obj = this.data.get(item.id)
      if (obj) item = { ...obj, ...item }
      item.chineseName = await this.getChineseName(item.nameLabel)
      return [item]
    } catch (error) {
      return []
    }
  }

  /**
   * AI过滤
   */
  async aiFilterData(data: any[]) {
    if (!data || !Array.isArray(data) || data.length === 0) {
      return []
    }

    const filters = [
      // 上架时间范围校验
      (item: any) => {
        const result = this.checkRange(item.releaseDate, undefined, 365)
        return result
      },
      // 跟卖人数范围校验
      (item: any) => {
        const result = this.checkRange(item.sellerNumber, undefined, 30)
        return result
      },
      // 月销售动态范围校验
      (item: any) => {
        const result = item.salesDynamics > 0
        return result
      },
      // 广告份额范围校验
      (item: any) => {
        const result = this.checkRange(item.drr, undefined, 15)
        return result
      },
      // 销量范围校验
      (item: any) => {
        const rules = [
          { max: 500, minSold: 500 },
          { max: 1000, minSold: 150 },
          { max: 5000, minSold: 30 },
          { max: 10000, minSold: 15 },
        ]

        const rule = rules.find((r) => Number(item.price) <= r.max)
        return this.checkRange(item.soldCount, (rule?.minSold || 5) + 1)
      },
    ]

    const filteredData = data.filter((item) => {
      const results = filters.map((filterFn) => filterFn(item))
      const overallResult = results.every((r) => r)
      return overallResult
    })
    return filteredData
  }
  /**
   * 数据过滤
   */
  async filterData(data: any[], task: Task) {
    if (!data || !Array.isArray(data) || data.length === 0) {
      return []
    }

    // 定义过滤条件映射
    const filters = [
      // 品牌类型过滤
      (item: any) => {
        if (task?.brandType === undefined || task?.brandType === null || +task?.brandType === 2)
          return true
        if (+task?.brandType === 0) return item.brand && item.brand.trim()
        if (+task?.brandType === 1) return !(item.brand && item.brand.trim())
        return true
      },
      // 销量范围校验
      (item: any) => {
        const result = this.checkRange(item.soldCount, task.soldCountMin, task.soldCountMax)
        return result
      },
      // 月销售额范围校验
      (item: any) => {
        const result = this.checkRange(item.gmvSum, task.gmvSumMin, task.gmvSumMax)
        return result
      },
      // 销售价格范围校验
      (item: any) => {
        const result = this.checkRange(item.price, task.salePriceMin, task.salePriceMax)
        return result
      },
      // 重量范围校验
      (item: any) => {
        const result = this.checkRange(item.weight, task.weightMin, task.weightMax)
        return result
      },
      // 上架时间范围校验
      (item: any) => {
        const result = this.checkRange(item.releaseDate, task.upGoodsTimeMin, task.upGoodsTimeMax)
        return result
      },
      // 月销售动态范围校验
      (item: any) => {
        const result = this.checkRange(
          item.salesDynamics,
          task.monthDynamicsMin,
          task.monthDynamicsMax,
        )
        return result
      },
      // 广告份额范围校验
      (item: any) => {
        const result = this.checkRange(item.drr, task.adFeeMin, task.adFeeMax)
        return result
      },
      // 参与促销天数范围校验
      (item: any) => {
        const result = this.checkRange(item.daysInPromo, task.promotionDayMin, task.promotionDayMax)
        return result
      },
      // 参与促销折扣范围校验
      (item: any) => {
        const result = this.checkRange(
          item.discount,
          task.promotionDiscountMin,
          task.promotionDiscountMax,
        )
        return result
      },
      // 促销活动转化率范围校验
      (item: any) => {
        const result = this.checkRange(
          item.promoRevenueShare,
          task.promotionDynamicsMin,
          task.promotionDynamicsMax,
        )
        return result
      },
      // 付费推广天数范围校验
      (item: any) => {
        const result = this.checkRange(
          item.daysWithTrafarets,
          task.promoteDayMin,
          task.promoteDayMax,
        )
        return result
      },
      // 浏览量范围校验
      (item: any) => {
        const result = this.checkRange(item.sessionCount, task.viewsMin, task.viewsMax)
        return result
      },
      // 商品卡片加购率范围校验
      (item: any) => {
        const result = this.checkRange(item.convToCartPdp, task.cardRateMin, task.cardRateMax)
        return result
      },
      // 搜索和目录加购率范围校验
      (item: any) => {
        const result = this.checkRange(item.convToCartSearch, task.showRateMin, task.showRateMax)
        return result
      },
      // 跟卖人数范围校验
      (item: any) => {
        const result = this.checkRange(item.sellerNumber, task.followMin, task.followMax)
        return result
      },
      // 发货模式校验
      (item: any) => {
        if (!task.salesSchema) return true
        const result = task.salesSchema?.includes(item.salesSchema)
        return result
      },
    ]
    const filteredData = data.filter((item) => {
      const results = filters.map((filterFn) => filterFn(item))
      const overallResult = results.every((r) => r)
      return overallResult
    })
    return filteredData
  }

  /**
   * 检查数值是否在范围内
   * @param value 待检查的值
   * @param min 最小值
   * @param max 最大值
   * @returns 是否符合范围
   */
  private checkRange(
    value: number | string | undefined | null,
    min?: number,
    max?: number,
  ): boolean {
    if ((min === undefined && max === undefined) || (min === null && max === null)) return true

    let num = 0
    if (value !== undefined && value !== null) num = Number(value)
    if (isNaN(num)) return false

    if (min !== undefined && min !== null && num < min) return false
    if (max !== undefined && max !== null && num > max) return false

    return true
  }

  /**
   * 利润率判断
   * @param value 待检查的值
   * @param target 目标
   * @returns 是否符合范围
   */
  checkTargetProfitPercent(value: number, target: number) {
    if (value === undefined || value === null) return false
    if (isNaN(Number(value))) return false
    if (!target && Number(target) !== 0) return true
    return Number(value) >= target
  }
  /**
   * 销毁实例
   */
  destroy() {
    this.data.clear()
  }
}
