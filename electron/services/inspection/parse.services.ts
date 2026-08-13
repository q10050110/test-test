import * as cheerio from 'cheerio'
import { MainWindowService } from './main-window.services.js'
import log from '../../log/index.js'

export class ParseService {
  protected ozonGoodsData: Set<string> = new Set()
  private windowService: MainWindowService | null = null
  private taskStatus: { status: 'running' | 'completed' }

  constructor(windowService: MainWindowService, taskStatus: { status: 'running' | 'completed' }) {
    this.windowService = windowService
    this.taskStatus = taskStatus
  }
  async ozonListParser(html: any | undefined, domain: string) {
    const data: any[] = []
    if (!html) return []
    const $ = cheerio.load(html)
    const dom = $('#contentScrollPaginator a')
    // 解析DOM，获取商品数据
    dom.each((index, element) => {
      if (this.taskStatus.status === 'completed') return
      const href = $(element).attr('href')
      const cover = $(element).find('img')?.attr('src')
      const id = href?.match(/-(\d+)(?=\/|\?)/)?.[1]
      const queryUrl = encodeURIComponent(
        `/modal/otherOffersFromSellers?product_id=${id}&page_changed=true`,
      )
      const requestUrl = `${domain}/api/entrypoint-api.bx/page/json/v2?url=${queryUrl}`
      const link = `https://www.ozon.ru/product/${id}`
      const price = $(element)
        .parent()
        .find('.tsHeadline500Medium')
        .text()
        .trim()
        .replace(/[\s\u2009₽]/g, '')
      const oPrice = $(element)
        .parent()
        .find('.tsBodyControl400Small')
        .text()
        .match(/[\d\s\u2009]+(?=₽)/)?.[0]
        ?.replace(/[\s\u2009]/g, '')
      // const discount = $(element).parent().find('.tsBodyControl400Small').text().trim().match(/-\d+%|\d+%/)?.[0];
      const name = $(element).parent().find('a').children('div').children('span').text()
      let str = $(element)
        .parent()
        .find('.tsBodyMBold')
        .text()
        .replace(/\u202F/g, ' ')
      if (!str)
        str = $(element)
          .parent()
          .find('.tsBodyControl300XSmall')
          .text()
          .replace(/\u202F/g, ' ')

      const match = str.match(/\s*([0-5]\.\d{1})\s*(\d[\d\s]*)\s*/i)
      const rating = match ? match[1] : 0
      const reviewCountLabel = match ? match[2].replace(/\s/g, '') : 0
      const obj = {
        href,
        price: Number(price),
        price1: Number(price),
        oPrice,
        oPrice1: oPrice,
        // discountLabel: isNaN(Number(discount)) ? discount : `${Number(discount).toFixed(2)}%`,
        link,
        cover,
        cover3: cover,
        nameLabel: name,
        id,
        rating,
        sku: id,
        requestUrl,
        reviewCountLabel,
      }
      if (id) {
        data.push(obj)
      }
    })

    const uniqueData: any[] = []
    for (const item of data) {
      if (this.ozonGoodsData.has(item.id)) continue
      this.ozonGoodsData.add(item.id)
      uniqueData.push(item)
    }

    for (const item of uniqueData) {
      if (this.taskStatus.status === 'completed') break
      const response = await this.windowService?.getSellingData(item.requestUrl)
      await new Promise(resolve => setTimeout(resolve, 1000))
      if (response?.success) {
        const sellers = JSON.parse(
          response.data.widgetStates?.['webSellerList-4723017-default-1'] || '{}',
        )
        item.sellerNumber = sellers?.sellers?.length || 0
        const priceList = sellers?.sellers
          ?.map((item: any) => +item?.price?.cardPrice?.price?.replace(/[^\d.]/g, ''))
          .filter((subItem: any) => subItem && subItem < item.price)
        item.followMinPrice = priceList?.length ? Math.min(...priceList) : item.price
        item.followMaxPrice = priceList?.length ? Math.max(...priceList) : item.price
        item.followList = sellers?.sellers?.map((item: any) => ({
          sku: item?.sku,
          name: item?.name,
          logoImageUrl: item?.logoImageUrl,
          coverImage: item?.coverImage,
          price: item?.price,
          rating: item?.rating,
          credentials: item?.credentials,
          link: item?.link
        })) || []
      } else {
        item.sellerNumber = undefined
        item.followMinPrice = item.price
        item.followMaxPrice = item.price
        item.followList = []
        log.error('获取跟卖数据失败')
      }
    }
    return uniqueData
  }

  /**
   * 获取商品数量
   */
  getDataCount() {
    return this.ozonGoodsData.size
  }

  /**
   * 销毁实例
   */
  destroy() {
    this.ozonGoodsData.clear()
    this.windowService = null
  }
}
