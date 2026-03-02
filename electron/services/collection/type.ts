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
  targetCount?: number
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
  expendType: boolean
  expendShopCount: number
}

export type Reason = 'success' | 'cancel' | 'failed' | undefined
