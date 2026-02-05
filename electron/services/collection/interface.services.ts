import request from "../../utils/request.js"

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