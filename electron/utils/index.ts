import request from './request.js';
import pako from 'pako'
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
    if (res.data.code) return res.data.data?.['RUB/CNY']
  } catch (error) {
    return 0
  }
}

/**
 * 货币转换
 * @params price 价格
 * @params rate 汇率
  */
export const currencyConversion = (price: number, rate: number) => {
  return price * rate
}

