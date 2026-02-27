import request from '../../utils/request.js'
import { Task } from './type.js'
import { operationStore } from '../../store/index.js'
import { compressData } from '../../utils/index.js'
import log from '../../log/index.js'
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
  const user = operationStore.get('user')
  try {
    const res = await request({
      url: '/api/other/shop/getShopList',
      method: 'post',
      data: {},
    })
    const data = res.data
      .filter((item: any) => item.platform === 'OZON' && item.account_id === user._id)

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

export const getConfigList = async () => {
  try {
    const user = operationStore.get('user')
    const res = await request({
      url: '/api/goods/upGoodsConfig/getConfig',
      method: 'post',
      data: {},
    })
    res.data.data = res.data.data
      .filter((item: any) => item.platform === 'OZON' && item.user_id === user._id)
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
      message: error?.response?.data?.message || '系统繁忙',
      data: null
    }
  }
}

/**
 * 自动上架
 */
export const autoUpGoods = async (task: Task, goodsData: Map<string, any>) => {
  if (goodsData.size === 0) return '没有可上架的商品'
  const source = Array.from(goodsData.values())
  const result = []
  const baseParams = {
    client_id: task.client_id,
    upDataConfigId: task.upDataConfigId,
    watermark_id: undefined,
    collect_ids: [],
    has_brand: 126745801,
    img_order_type: 0,
    is_ai: false,
    is_compress: true,
    is_down_fx: false,
    stock: task.stock,
    up_goods_type: 0,
    use_pack: true,
    warehouse_id: task.warehouse_id,
  }

  while (source.length > 0) {
    const chunk = source
      .splice(0, 100)
      .map((item) => ({
        goods_id: item.id,
        name: item.nameLabel,
        offer_id: '',
        old_price: (item.resMoney * 1.6).toFixed(2),
        origin_price: (item.resMoney * 1.6).toFixed(2),
        price: item.resMoney,
      }))
      .filter((item) => item.price)

    log.info(chunk, '批量上架的商品')

    const params = {
      ...baseParams,
      goods: compressData(chunk),
    }
    try {
      const res = await batchUpGoods(params)
      if (res?.code !== 0) result.push(res?.message || res)
    } catch (error) {
      result.push(error)
    }
  }
  return result.length ? result.join(',') : 'success'
}
