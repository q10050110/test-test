import request from '../../utils/request.js'

import {
  TaskParams,
  InspectionList,
  UpdateTaskStatusParams,
  UpdateTaskParams,
  SaveSellDataParams,
  GoodsDetailParams,
  GoodsDetail,
  ShopList,
  BatchSaveSellDataParams,
  InspectionDetailParams,
  InspectionDetailList,
  Inspection,
  SellListParams
} from './type'
import { InterfaceResult, PageParams } from '../../types/index'

// 获取任务列表
export const getTaskListAPI = (data: PageParams) =>
  request<InterfaceResult<InspectionList>, InterfaceResult<InspectionList>>({
    url: '/api/auto/followSellTask/getFollowSellTaskList',
    method: 'post',
    data,
  })

// 获取定时任务列表
export const getTimerTaskListAPI = () =>
  request<InterfaceResult<Inspection[]>, InterfaceResult<Inspection[]>>({
    url: '/api/auto/followSellTask/getAllFollowSellTaskList',
    method: 'post',
    data: {}
  })

// 创建任务
export const createTaskAPI = (data: TaskParams) =>
  request<InterfaceResult<Inspection>, InterfaceResult<Inspection>>({
    url: '/api/auto/followSellTask/createFollowSellTask',
    method: 'post',
    data,
  })

// 更新任务状态
export const updateTaskStatusAPI = (data: UpdateTaskStatusParams) =>
  request<InterfaceResult<Inspection>, InterfaceResult<Inspection>>({
    url: '/api/auto/followSellTask/updateFollowSellTaskStatus',
    method: 'post',
    data,
  })

// 删除任务
export const deleteTaskAPI = (data: { taskIds: string[] }) =>
  request<InterfaceResult<string>, InterfaceResult<string>>({
    url: '/api/auto/followSellTask/deleteBatchFollowSellTask',
    method: 'post',
    data,
  })

// 修改任务
export const updateTaskAPI = (data: UpdateTaskParams) =>
  request<InterfaceResult<Inspection>, InterfaceResult<Inspection>>({
    url: '/api/auto/followSellTask/editFollowSellTask',
    method: 'post',
    data,
  })

// 保存跟卖数据
export const saveSellDataAPI = (data: SaveSellDataParams) =>
  request<InterfaceResult<string>, InterfaceResult<string>>({
    url: '/api/auto/followSellTask/addFollowSellData',
    method: 'post',
    data,
  })

// 批量保存跟卖数据
export const batchSaveSellDataAPI = (data: BatchSaveSellDataParams) =>
  request<InterfaceResult<{ sku: string, dataId: string }[]>, InterfaceResult<{ sku: string, dataId: string }[]>>({
    url: '/api/auto/followSellTask/addFollowSellDataBatch',
    method: 'post',
    data,
  })

// 保存跟卖列表数据
export const saveSellListDataAPI = (data: SellListParams) => request<InterfaceResult<string>, InterfaceResult<string>>({
  url: '/api/auto/followSellTask/addFollowListItems',
  method: 'post',
  data
})

// 获取巡查详情
export const getInspectionDetailAPI = (data: InspectionDetailParams) =>
  request<InterfaceResult<InspectionDetailList>, InterfaceResult<InspectionDetailList>>({
    url: '/api/auto/followSellTask/getFollowSellDataList',
    method: 'post',
    data,
  })

// 获取商品详情
export const getGoodsDetailAPI = (data: GoodsDetailParams) =>
  request<InterfaceResult<GoodsDetail>, InterfaceResult<GoodsDetail>>({
    url: '/api/auto/followSellTask/getFollowSellDataBySku',
    method: 'post',
    data,
  })

// 获取店铺列表
export const getShopListAPI = (data: PageParams) =>
  request<InterfaceResult<ShopList>, InterfaceResult<ShopList>>({
    url: '/api/auto/followSellTask/getFollowSellShopList',
    method: 'post',
    data,
  })