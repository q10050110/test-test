import request, { downloadFile } from '../../utils/request.js'
import { Config, ConfigList, ShopData, Task } from './type.js'
import { operationStore } from '../../store/index.js'
import { compressData } from '../../utils/index.js'
import log from '../../log/index.js'
import { getRate, currencyConversion, getShopCurCode } from '../../utils/index.js'
import dayjs from 'dayjs'
import { runInNewContext } from 'node:vm'
let configList: ConfigList = []
let shopList: ShopData[] = []
let rate: any = null

/**
 * 获取物流
 */
export const getLogisticsList = async () => {
  try {
    const res = await request({
      url: '/api/auto/other/getLogisticsSimple',
      method: 'post',
      data: {},
    })
    return {
      code: 400,
      data: res.data,
      message: '获取成功',
    }
  } catch (error) {
    return {
      code: 500,
      message: '获取失败！',
    }
  }
}

/**
 * 获取列表
 */
export const getShopList = async () => {
  const user = operationStore.get('user')
  try {
    const res = await request({
      url: '/api/other/shop/getShopList',
      method: 'post',
      data: {},
    })
    const data = res.data.filter(
      (item: any) => item.platform === 'OZON' && item.account_id === user._id,
    )
    shopList = data
    return {
      code: 400,
      data,
      message: '获取成功',
    }
  } catch (error) {
    return {
      code: 500,
      message: '获取失败！',
    }
  }
}

/**
 * 获取配置
 */
export const getConfigList = async () => {
  try {
    const user = operationStore.get('user')
    const res = await request({
      url: '/api/goods/upGoodsConfig/getConfig',
      method: 'post',
      data: {},
    })
    res.data.data = res.data.data.filter(
      (item: any) => item.platform === 'OZON' && item.user_id === user._id,
    )
    configList = res.data.data
    return {
      code: 400,
      data: res.data,
      message: '获取成功',
    }
  } catch (error) {
    return {
      code: 500,
      message: '获取失败！',
    }
  }
}

/**
 * 获取分类
 */
export const getCategoryList = async () => {
  try {
    const versionRes = await request({
      url: '/api/goods/open/ozon/getOZONCategoryVersion',
      method: 'post',
    })
    const categoryVersion = operationStore.get('categoryVersion')
    const categoryList = operationStore.get('categoryList') || []
    if (versionRes.data === categoryVersion && categoryList?.length)
      return {
        code: 400,
        data: categoryList,
        message: '获取成功',
      }
    const category = await downloadFile({
      url: '/resources/docs/js/ozoncategory.js',
      method: 'get',
    })
    let jsContent = typeof category.data === 'string' ? category.data : category.data.toString()
    jsContent = jsContent.replace(/export\s+default\s+(\w+)/g, 'this.arr = $1;')
    const sandbox = {
      arr: [], // 用于接收 JS 中定义的 arr
      // 防止 JS 代码中引用全局变量报错
      window: {},
      global: {},
    }
    runInNewContext(jsContent, sandbox)
    const extractedArr = sandbox.arr
    operationStore.set('categoryVersion', versionRes.data)
    operationStore.set('categoryList', extractedArr)
    return {
      code: 400,
      data: extractedArr,
      message: '获取成功',
    }
  } catch (error) {
    console.log(error)
    return {
      code: 500,
      message: '获取失败！',
    }
  }
}

/**
 * 批量上架接口
 */
export const batchUpGoods = async (data: any) => {
  try {
    const res = await request<
      { code: number; data: null; message: string },
      { code: number; data: null; message: string }
    >({
      url: '/api/goods/batchUpGoods/ozon/batchCreateGoods',
      method: 'post',
      data,
    })
    return res
  } catch (error: any) {
    return {
      code: 500,
      message: error,
      data: null,
    }
  }
}

/**
 * 自动上架
 */
export const autoUpGoods = async (task: Task, goodsData: Map<string, any>) => {
  if (goodsData.size === 0) return '没有可上架的商品'
  if (!rate) rate = await getRate()
  const source = Array.from(goodsData.values())
  const result = []
  let config: Config | undefined
  if (task.upDataConfigId) config = configList?.find((item) => item._id === task.upDataConfigId)
  if (!task.unit) {
    const shopId = config ? config?.shopData[0].client_id : task.client_id
    const currency_code = shopList?.find((item) => shopId === item.client_id)?.currency_code
    task.unit = getShopCurCode(currency_code || 'CNY')
  }
  const baseParams = {
    client_id: task.client_id,
    upDataConfigId: task.upDataConfigId,
    watermark_id: config ? config?.imgWaterMark : undefined,
    collect_ids: [],
    has_brand: config ? config?.brands : 126745801,
    img_order_type: config ? config.imgOrder : 0,
    is_ai: config ? config?.is_ai : false,
    is_compress: true,
    is_down_fx: config ? config?.infringement : false,
    stock: config ? undefined : task.stock,
    up_goods_type: 0,
    use_pack: true,
    warehouse_id: task.warehouse_id,
    total_num: goodsData.size,
    ocType: 'auto',
  }

  while (source.length > 0) {
    const chunk = source
      .splice(0, 100)
      .map((item) => ({
        goods_id: item.id,
        name: '',
        offer_id: config?.offerIdPrefix ? `${config?.offerIdPrefix}-${dayjs(Date.now()).format('YYMMDDHHmm')}-${Math.floor(
          Math.random() * 100000000
        )
          .toString()
          .padStart(8, '0')}` : `ob-${dayjs(Date.now()).format('YYMMDDHHmm')}-${Math.floor(
            Math.random() * 100000000
          )
            .toString()
            .padStart(8, '0')}`,
        old_price: config?.cropPrice ? ((currencyConversion(item.resMoney, rate, task.unit) * config.cropPrice || 1) / 100).toFixed(2) : (currencyConversion(item.resMoney, rate, task.unit) * 1.6).toFixed(2),
        origin_price: config?.cropPrice ? ((currencyConversion(item.resMoney, rate, task.unit) * config.cropPrice || 1) / 100).toFixed(2) : (currencyConversion(item.resMoney, rate, task.unit) * 1.6).toFixed(2),
        price: config?.price ? (currencyConversion(item.resMoney, rate, task.unit) * config.price / 100).toFixed(2) : currencyConversion(item.resMoney, rate, task.unit),
        goods_source_url: item?.['1688link']
      }))
      .filter((item) => item.price)

    log.info(chunk, '批量上架的商品')

    const params = {
      ...baseParams,
      goods: compressData(chunk),
    }
    const res = await batchUpGoods(params)
    if (res?.code !== 0) {
      result.push(res?.message)
      if (res?.message === '帮豆数量不足，请充值') break
    }
  }
  return result.length ? result.join(',') : 'success'
}

/**
 * 保存数据接口
 */
const saveData = async (data: { taskId: string; datas: any[] }) => {
  try {
    const res = await request<
      { code: number; data: null; message: string },
      { code: number; data: null; message: string }
    >({
      url: '/api/goods/autoTask/saveAutoPickRecords',
      method: 'post',
      data,
    })
    return res
  } catch (error: any) {
    return {
      code: 500,
      message: error,
      data: null,
    }
  }
}

export const autoSaveData = async (data: { taskId: string; datas: any[] }) => {
  const { datas } = data
  while (datas.length > 0) {
    const chunk = datas.splice(0, 1000)
    const { code, message } = await saveData({ taskId: data.taskId, datas: chunk })
    if (code) {
      log.error('保存数据失败', message)
      return code
    }
  }
  return 0
}
