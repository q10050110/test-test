import request from './request.js'
import pako from 'pako'
import Decimal from 'decimal.js'
import log from '../log/index.js'
import * as dns from 'node:dns';
export const compressData = (text: any) => {
  text = JSON.stringify(text)
  // 将文本数据转换为 Uint8Array
  const textBytes = new TextEncoder().encode(text)

  // 使用 pako 压缩数据
  const compressedData = pako.deflate(textBytes)

  // 将压缩后的数据转换为 ArrayBuffer
  const compressedArrayBuffer = compressedData.buffer.slice(
    compressedData.byteOffset,
    compressedData.byteOffset + compressedData.byteLength,
  )

  // 将 ArrayBuffer 转换为 ArrayBuffer 的 base64 编码字符串
  const compressedBase64 = btoa(String.fromCharCode(...new Uint8Array(compressedArrayBuffer)))
  return compressedBase64
}

/**
 * 获取汇率 
 */
export const getRate = async () => {
  try {
    const res = await request({
      url: '/api/order/open/getExchangeRate',
      method: 'post',
      data: {},
    })

    return res.data
  } catch (error) {
    return 0
  }
}

/**
 * 货币转换
 * @params price 价格
 * @params rate 汇率
 */
export const currencyConversion = (
  basePrice: number,
  rateObj: any,
  unit: '¥' | '$' | '₽' | '€' | 'YN' | '₸',
): number => {
  let rate
  if (!rateObj) return 0
  switch (unit) {
    case '¥':
      rate = 1
      break
    case 'YN':
    case '₽':
      rate = rateObj?.['CNY/RUB']
      break
    case '$':
      rate = rateObj?.['CNY/USD']
      break
    case '€':
      const num = rateObj?.['CNY/EUR']
      rate = (1 / num).toFixed(4)
      break
    case '₸':
      rate = rateObj?.['CNY/KZT']
      break
  }
  const priceNum = Number(basePrice)
  const rateNum = Number(rate)

  if (isNaN(priceNum) || isNaN(rateNum)) {
    log.error('货币转换错误', basePrice, rate, unit)
    return 0
  }

  let price = new Decimal(basePrice)

  return Number(price.mul(rate).toFixed(2)) // 最终展示精度
}

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

/** 
 * 检测网络是否可用
  */
export const checkNetworkStatus = (): Promise<boolean> => {
  return new Promise((resolve) => {
    dns.resolve('baidu.com', (err) => {
      if (err) {
        console.error('网络不可用:');
        resolve(false);
      } else {
        console.log('网络可用');
        resolve(true);
      }
    });
  });
}