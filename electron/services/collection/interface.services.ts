import request from "../../utils/request.js"
import { Task } from "./type.js"
import { compressData, currencyConversion } from '../../utils/index.js'
import log from "../../log/index.js"
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
export const getShopList = async () => {
  try {
    const res = await request({
      url: '/api/other/shop/getShopList',
      method: 'post',
      data: {}
    })
    return {
      code: 400,
      data: res.data.filter((item: any) => item.platform === 'OZON'),
      message: '获取成功'
    }
  } catch (error) {
    return {
      code: 500,
      message: '获取失败！'
    }
  }
}

export const getConfigList = async () => {
  try {
    const res = await request({
      url: '/api/goods/upGoodsConfig/getConfig',
      method: 'post',
      data: {}
    })
    return {
      code: 400,
      data: res.data,
      message: '获取成功'
    }
  } catch (error) {
    return {
      code: 500,
      message: '获取失败！'
    }
  }
}


/**
 * 批量上架接口
  */
export const batchUpGoods = async (data: any) => {
  try {
    await request({
      url: '/api/goods/batchUpGoods/ozon/batchCreateGoods',
      method: 'post',
      data
    })
    return true
  } catch (error) {
    return error
  }
}

/**
 * 自动上架
  */
export const autoUpGoods = async (task: Task, rate: number, goodsData: Map<string, any>) => {
  if (!task.isUseAutoUpGoods || !rate) return
  const source = Array.from(goodsData.values())
  const result = []
  const baseParams = {
    client_id: task.client_id,
    collect_ids: [undefined],
    has_brand: 126745801,
    img_order_type: 0,
    is_ai: false,
    is_compress: true,
    is_down_fx: false,
    stock: task.stock,
    up_goods_type: 0,
    use_pack: true,
    warehouse_id: task.warehouse_id
  }

  while (source.length > 0) {
    const chunk = source.splice(0, 100).map(item => ({
      goods_id: item.id,
      name: item.chineseName,
      offer_id: '',
      old_price: currencyConversion(item.price, rate, 'old', task.unit || '¥'),
      origin_price: currencyConversion(item.price, rate, 'origin', task.unit || '¥'),
      price: currencyConversion(item.price, rate, 'current', task.unit || '¥')
    })).filter(item => item.price)

    log.info(chunk, '批量上架的商品')

    const params = {
      ...baseParams,
      goods: compressData(chunk)
    }

    const res = await batchUpGoods(params)
    if (res?.data?.code !== 0) result.push(res)
  }

  return result.length ? result.join(',') : 'success'
}