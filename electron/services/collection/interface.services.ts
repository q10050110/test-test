import request from "../../utils/request"
export const getShopList = async () => {
  try {
    const res = await request({
      url: '/api/other/shop/getShopList',
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

