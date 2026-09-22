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