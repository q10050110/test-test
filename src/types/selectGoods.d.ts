export type TaskStatus = 'noExecuted' | 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export type Task = {
  _id?: string
  taskStatus?: TaskStatus
  isUseAutoUpGoods?: boolean
  upDataConfigId?: string
  warehouse_id?: string
  stock?: number
  client_id?: string
  progress?: {
    current?: number
    total?: number
    totalCount?: number
  }
  createTime?: string
  updateTime?: string
  lastRunningTime?: string
  taskName: string
  targetUrl: string
  myProfitPercent?: number
  internalExpress?: string
  rubExpressPrice?: number
  elsePercent?: number
  sourceType?: string | number
  targetCount?: number
  targetProfitPercent?: number
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
  log?: { taskLog: string, date: string }[],
  tableFilePath?: string
  unit?: string,
  aiSelectType: number
}

export type TaskList = {
  list: Task[]
  total: number
}

export type LogisticsSimple = {
  label: string
  value: string
  icon: string
}

export type LogisticsSimpleList = LogisticsSimple[]


export type Warehouse = {
  name: string
  warehouse_id: number
}

export type Shop = {
  account_id: string
  client_id: string
  cookie_status: number
  currency_code: string
  platform: string
  shop_name: string
  status: number,
  warehouse: Warehouse[]
}

export type ShopList = Shop[]


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
}

export type ConfigList = Config[]