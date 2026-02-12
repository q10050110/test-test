import * as cheerio from 'cheerio'
import { MainWindowService } from './main-window.services.js'
import log from '../../log/index.js'

export class ParseService {
  protected ozonGoodsData: Set<string> = new Set()
  private windowService: MainWindowService | null = null

  constructor(windowService: MainWindowService) {
    this.windowService = windowService
  }
  async ozonListParser(html: any | undefined, domain: string) {
    const data: any[] = []
    if (!html) return []
    const $ = cheerio.load(html)
    const dom = $('#contentScrollPaginator a')
    // 解析DOM，获取商品数据
    dom.each((index, element) => {
      const href = $(element).attr('href');
      const cover = $(element).find('img')?.attr('src');
      const id = href?.match(/-(\d+)(?=\/|\?)/)?.[1];
      const queryUrl = encodeURIComponent(
        `/modal/otherOffersFromSellers?product_id=${id}&page_changed=true`
      );
      const requestUrl = `${domain}/api/entrypoint-api.bx/page/json/v2?url=${queryUrl}`;
      const link = `https://www.ozon.ru/product/${id}`;
      const price = $(element).parent().find('.tsHeadline500Medium').text().trim().replace(/[\s\u2009₽]/g, '');
      const oPrice = $(element).parent().find('.tsBodyControl400Small').text().match(/[\d\s\u2009]+(?=₽)/)?.[0]?.replace(/[\s\u2009]/g, '');
      // const discount = $(element).parent().find('.tsBodyControl400Small').text().trim().match(/-\d+%|\d+%/)?.[0];
      const name = $(element).parent().find('a').children('div').children('span').text();
      const str = $(element).parent().text()
      const ratingMatch = str.match(/\d+\.\d/)
      const rating = ratingMatch?.[0] ?? 0
      const cleanedStr = ratingMatch
        ? str.replace(ratingMatch[0], '')
        : str
      const commentMatch = cleanedStr.match(/(\d[\d\s\u202F]*)\s*отзыв/)
      const reviewCountLabel = commentMatch
        ? commentMatch[1].replace(/[\s\u202F]/g, '')
        : 0

      const obj = {
        href,
        price: Number(price),
        oPrice,
        // discountLabel: isNaN(Number(discount)) ? discount : `${Number(discount).toFixed(2)}%`,
        link,
        cover,
        nameLabel: name,
        id,
        rating: rating,
        sku: id,
        requestUrl,
        reviewCountLabel
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
      const response = await this.windowService?.getSellingData(item.requestUrl)
      if (response?.success) {
        item.sellerNumber =
          JSON.parse(response.data.widgetStates?.['webSellerList-4723017-default-1'] || '{}')
            ?.sellers?.length || 0
      } else {
        item.sellerNumber = 0
        log.error('获取跟卖数据失败')
      }
    }
    return uniqueData
  }

  async '1688Parse'(html: any, link: any) {
    const $ = cheerio.load(html)
    let str, price1, price2, link1688, cover2 = ''
    const goodsList = $('.offerListLayoutWrapper--o0LXuuFm').children('div')
    goodsList.each((index, element) => {
      const isAd = $(element).find('.mainImgIcon--Y8zt2ArJ').length > 0
      if (isAd) return
      str = $(element).attr('data-renderkey')?.split('_')
      price1 = $(element).children('.offer-price-row').find('.textMain--s_l2eHVJ').text()
      price2 = $(element).children('.offer-price-row').find('.textMain--s_l2eHVJ').next().text()
      link1688 = `https://detail.1688.com/offer/${str?.[str?.length - 1]}.html`
      cover2 = $(element).find('.mainImg--GT1EYFGa').attr('src') || ''
      return false
    })
    const price = `${price1}${price2}`
    const sourcePrice = isNaN(Number(price)) ? 0 : price
    return { link1688, sourcePrice, cover2 }
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