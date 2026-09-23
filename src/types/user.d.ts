export type platform = 'OZON' | 'WB'

export type User = {
  _id: string
  name: string
  phone: string
  vip_type: number
  translate_quota: number
  sj_pack: number
  daili_code: string
  platform: platform[]
  reci_vip_time: number | string
  auto_order: boolean
  vip_expire: number
  ai_quota: number
  sub_account: []
} & UserVipInfo

export type VipInfo = {
  vip_name: string;
  auto_vip_type: number;
  device_limit: number | string;
  day_pick_count: number | string;
  price: number | string;
  original_price: number | string;
  days: number | string;
}


export type UserVipInfo = {
  auto_vip_type: number
  expire_time: number
  day_auto_vip_once: boolean
  vip_name: string
}

export type VipPayInfo = {
  amount: number
  final_days: number
  exchangeDay: number
  auto_vip_type: number
}

export type VipResult = {
  payInfo: string
  mchOrderNo: string
  time_expire: string
}

export type VipPayResult = {
  state: number
  subject: string
}
export type HomeData = {
  pickCount: number
  followSellCount: number
}

export type RecommendedCategories = {
  categoryId: string
  category_name: string
  rate: number
  parentId: string
  metric_items: number
  metric_gmv: number
  metric_gmv_growth: number
  metric_buyout: number
  metric_refund: number
  metric_aiv: number
  metric_brands: number
  metric_leader_share: number
  metric_aiv_growth: number
}