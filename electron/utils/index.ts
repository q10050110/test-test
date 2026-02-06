import request from './request.js';
import pako from 'pako'
import Decimal from 'decimal.js';
export const compressData = (text: any) => {
  text = JSON.stringify(text);
  // 将文本数据转换为 Uint8Array
  const textBytes = new TextEncoder().encode(text);

  // 使用 pako 压缩数据
  const compressedData = pako.deflate(textBytes);

  // 将压缩后的数据转换为 ArrayBuffer
  const compressedArrayBuffer = compressedData.buffer.slice(
    compressedData.byteOffset,
    compressedData.byteOffset + compressedData.byteLength
  );

  // 将 ArrayBuffer 转换为 ArrayBuffer 的 base64 编码字符串
  const compressedBase64 = btoa(
    String.fromCharCode(...new Uint8Array(compressedArrayBuffer))
  );
  return compressedBase64;
}


export const getRate = async () => {
  try {
    const res = await request({
      url: '/api/order/open/getExchangeRate',
      method: 'post',
      data: {}
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
  type: 'old' | 'origin' | 'current',
  unit: "¥" | "$" | "₽" | "€" | "YN" | "₸"
): string | null => {
  let rate
  if (!rateObj) return null
  switch (unit) {
    case '¥':
    case '₸':
      rate = rateObj?.['RUB/CNY']
      break
    case 'YN':
    case '₽':
      rate = 1
      break
    case '$':
      rate = rateObj?.['RUB/USD']
      break
    case '€':
      const num = rateObj?.['EUR/RUB']
      rate = (1 / num).toFixed(4)
      break
  }


  const priceNum = Number(basePrice)
  const rateNum = Number(rate)

  if (isNaN(priceNum) || isNaN(rateNum)) {
    return null
  }

  let price = new Decimal(basePrice)

  switch (type) {
    case 'current':
      // 改后售价 = 95% 后再取整
      price = price.mul(0.95).round()
      break

    case 'origin':
      // 划线价格 = 1.6 倍
      price = price.mul(1.6)
      break

    case 'old':
    default:
      // 原价不处理
      break
  }

  return price
    .mul(rate)
    .toFixed(2)   // 最终展示精度
}

