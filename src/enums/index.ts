const codeMap = {
  CNY: '¥',
  USD: '$',
  RUB: '₽',
  EUR: '€',
  BYN: 'YN',
  KZT: '₸',
}

export const getShopCurCode = (code: keyof typeof codeMap) => {
  function getCurrencyName(code: keyof typeof codeMap): string {
    return codeMap[code]
  }

  return getCurrencyName(code)
}
