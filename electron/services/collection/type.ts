export type TaskStatus = 'noExecuted' | 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'

export interface Task {
  _id: string
  taskStatus: TaskStatus
  isUseAutoUpGoods?: boolean
  upDataConfigId?: string
  warehouse_id?: string
  stock?: number
  client_id?: string
  progress: any
  createTime: string
  updateTime: string
  lastRunningTime: string
  taskName: string
  targetUrl: string
  myProfitPercent?: number
  internalExpress?: string
  rubExpressPrice?: number
  elsePercent?: number
  sourceType: '1' | '2'
  targetCount: number
  targetProfitPercent: number
  brandType?: string
  soldCountMin?: number
  soldCountMax?: number
  gmvSumMin?: number
  gmvSumMax?: number
  salePriceMin?: number
  salePriceMax?: number
  weightMin?: number
  weightMax?: number
  upGoodsTimeMin?: number
  upGoodsTimeMax?: number
  monthDynamicsMin?: number
  monthDynamicsMax?: number
  adFeeMin?: number
  adFeeMax?: number
  promotionDayMin?: number
  promotionDayMax?: number
  promotionDiscountMin?: number
  promotionDiscountMax?: number
  promotionDynamicsMin?: number
  promotionDynamicsMax?: number
  promoteDayMin?: number
  promoteDayMax?: number
  viewsMin?: number
  viewsMax?: number
  cardRateMin?: number
  cardRateMax?: number
  showRateMin?: number
  showRateMax?: number
  salesSchema?: string
  followMin?: number
  followMax?: number
  token?: string
  log?: { date: string; log: string }[]
  tableFilePath?: string
  unit?: '¥' | '$' | '₽' | '€' | 'YN' | '₸'
  autoResult?: string
  aiSelectType: number
}

export type Reason = 'success' | 'cancel' | 'failed' | undefined


export type ShopData = {
  client_id: string
  name: string
  stock: number
  warehouseId: string
}

export type Config = {
  brands: number
  createTime: string
  imgOrder: number
  imgWaterMark: string
  infringement: boolean
  isCustomPrice: boolean
  isCustomWaterMark: boolean
  isDefault: boolean
  is_ai: boolean
  name: string
  offerIdPrefix: string
  platform: string
  shopData: ShopData[]
  user_id: string
  _id: string
  cropPrice: number
  price: number
}

export type ConfigList = Config[]