export interface VipInfo {
  vip_name: string;
  vip_type: number;
  device_limit: number;
  day_pick_count: number;
  price: number;
  original_price: number;
  days: number;
}

export interface UserVipInfo {
  auto_vip_type: number
  expire_time: number
  day_auto_vip_once: boolean
  vip_name: string
}

export interface VipPayInfo {
  amount: number
  final_days: number
  exchangeDay: number
  auto_vip_type: number
}

export interface VipResult {
  payInfo: string
  mchOrderNo: string
  time_expire: string
}

export interface VipPayResult {
  state: number
  subject: string
}