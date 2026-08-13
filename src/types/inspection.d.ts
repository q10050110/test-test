export type TaskStatus = 'noExecuted' | 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'

export type Inspection = {
  _id: string
  shopName: string
  shopUrl: string
  executionMethod: 'AUTO' | 'MANUAL'
  autoExecutionTime: number
  status: TaskStatus
  user_id: string
  inspectedCount: number
  followedCount: number
  createTime: number
  lastRunningTime: number | string
}

export type InspectionList = {
  list: Inspection[]
  total: number
}

export type TaskParams = {
  taskId?: string
  shopName: string
  shopUrl: string
  taskStatus: string
  executionMethod: 'AUTO' | 'MANUAL'
  autoExecutionTime?: number
}

export type UpdateTaskStatusParams = {
  taskId: string
  status: 'PENDING' | 'COMPLETED' | 'FAILED'
}

export type UpdateTaskParams = TaskParams & {
  taskId: string
}

export type SaveSellDataParams = {
  taskId: string
  id: string
  link: string
  cover: string
  nameLabel: string
  resMoney: number
  followMinPrice: number
  followMaxPrice: number
  sellerNumber: number
  followList: object[]
}

export interface FollowTrendItem {
  /** 卖家数量/跟卖人数 */
  sellerNumber: number
  /** 日期时间字符串 */
  date: string
}

export type InspectionDetailParams = {
  /** 任务ID */
  taskId?: string
  /** 商品ID或相关标识 */
  id?: string
  /** 是否被跟卖 */
  isFollowed?: boolean
  /** 当前页码 */
  pageNo: number
  /** 每页条数 */
  pageSize: number
}

export type InspectionDetail = {
  /** 记录唯一ID */
  _id: string
  /** 任务ID */
  taskId: string
  /** 商品ID */
  id: string
  /** 商品链接 */
  link: string
  /** 商品封面图URL */
  cover: string
  /** 商品名称/标签 */
  nameLabel: string
  /** 当前售价/我的售价 (根据上下文推测为 resMoney) */
  resMoney: number
  /** 跟卖最低价 */
  followMinPrice: number
  /** 跟卖最高价 */
  followMaxPrice: number
  /** 跟卖卖家数量 */
  sellerNumber: number
  /** 用户ID */
  user_id: string
  /** 创建时间 (ISO 8601 格式) */
  createTime: string
  /** 更新时间 (ISO 8601 格式) */
  updateTime: string
  /** 跟卖趋势历史数据 */
  followTrends: FollowTrendItem[]
}

export type InspectionDetailList = {
  list: InspectionDetail[]
  total: number
}

export type GoodsDetailParams = {
  taskId: string
  id: string
}

export type FollowDetail = {
  sku: string,
  name: string
  logoImageUrl: string
  coverImage: string
  price: any
  rating: any
  credentials: string[]
}

export type GoodsDetail = {
  /** 记录唯一ID */
  _id: string
  /** 关联的任务ID */
  taskId: string
  /** 商品ID (Ozon ID) */
  id: string
  /** 商品链接 */
  link: string
  /** 商品封面图URL */
  cover: string
  /** 商品名称/标签 */
  nameLabel: string
  /** 当前售价/我的售价 */
  resMoney: number
  /** 跟卖最低价 */
  followMinPrice: number
  /** 跟卖最高价 */
  followMaxPrice: number
  /** 当前跟卖卖家数量 */
  sellerNumber: number
  /** 跟卖者详细列表 */
  followList: FollowDetail[]
  /** 用户ID */
  user_id: string
  /** 创建时间 (ISO 8601 字符串) */
  createTime: string
  /** 更新时间 (ISO 8601 字符串) */
  updateTime: string
  /** 跟卖趋势历史数据 */
  followTrends: FollowTrendItem[]
}

export type Shop = {
  _id: string
  shopName: string
  shopUrl: string
}