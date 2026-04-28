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
