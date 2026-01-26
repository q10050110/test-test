import fs from 'fs'
import path from 'path'
import axios from 'axios'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export const downLoadImage = async (url: string): Promise<Buffer> => {
  try {
    // 下载图片
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Referer': 'https://www.ozon.ru/'
      }
    })

    // 直接返回 Buffer
    return Buffer.from(response.data, 'binary')
  } catch (error: any) {
    console.error('下载失败', url, error?.message || error)
    return Buffer.from([]) // 返回空 Buffer 避免报错
  }
}
