const codeMap = {
  CNY: '¥',
  USD: '$',
  RUB: '₽',
  EUR: '€',
  BYN: 'YN',
  KZT: '₸',
} as const

export const getShopCurCode = (code: keyof typeof codeMap) => {
  function getCurrencyName(code: keyof typeof codeMap) {
    return codeMap[code]
  }

  return getCurrencyName(code)
}


const vipMap = {
  0: '非会员',
  1: '体验会员',
  2: '月卡会员',
  3: '季卡会员',
  4: '年费会员',
} as const

export const getVipName = (code: keyof typeof vipMap) => {
  function getVipName(code: keyof typeof vipMap) {
    return vipMap[code]
  }

  return getVipName(code)
}