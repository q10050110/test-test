export type platform = 'OZON' | "WB"

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