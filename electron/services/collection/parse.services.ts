import * as cheerio from 'cheerio'
import { MainWindowService } from './main-window.services.js'
import log from '../../log/index.js'

export class ParseService {
  protected ozonGoodsData: Set<string> = new Set()
  private windowService: MainWindowService | null = null
  guessLikeList: Set<string> = new Set()
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
      if (!str) str = $(element)
        .parent().find('.tsBodyControl300XSmall')
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
    if (!this.guessLikeList.size) {
      const likeDom = $('[data-widget="skuGrid"] a')
      // 获取猜你喜欢数据
      likeDom.each((index, element) => {
        const href = $(element).attr('href')
        const id = href?.match(/-(\d+)(?=\/|\?)/)?.[1]
        const queryUrl = encodeURIComponent(
          `/modal/otherOffersFromSellers?product_id=${id}&page_changed=true`,
        )
        const requestUrl = `${domain}/api/entrypoint-api.bx/page/json/v2?url=${queryUrl}`
        this.guessLikeList.add(requestUrl)
      })
    }

    const uniqueData: any[] = []
    for (const item of data) {
      if (this.ozonGoodsData.has(item.id)) continue
      this.ozonGoodsData.add(item.id)
      uniqueData.push(item)
    }

    for (const item of uniqueData) {
      const response = await this.windowService?.getSellingData(item.requestUrl)
      if (response?.success) {
        item.sellers = JSON.parse(response.data.widgetStates?.['webSellerList-4723017-default-1'] || '{}')
        item.sellerNumber = item?.sellers?.sellers?.length || undefined
        const priceList = item?.sellers?.sellers?.map((item: any) => +item?.price?.cardPrice?.price?.replace(/[^\d.]/g, '')).filter((subItem: any) => subItem && subItem < item.price)
        item.sellerNumber1 = item.sellerNumber
        item.followMinPrice = priceList?.length ? Math.min(...priceList) : item.price
        item.followMinPrice1 = item.followMinPrice
      } else {
        item.sellerNumber = undefined
        item.followMinPrice = item.price
        log.error('获取跟卖数据失败')
      }
    }
    return uniqueData
  }

  async '1688Parse'(html: any) {
    const $ = cheerio.load(html)
    let str,
      price1,
      price2,
      link1688,
      cover2 = ''
    const goodsList = $('.offerListLayoutWrapper--qlAH8LJK').children('div')
    goodsList.each((index, element) => {
      const isAd = $(element).find('.mainImgIcon--GzUD_qpZ').length > 0
      if (isAd) return
      str = $(element).attr('data-renderkey')?.split('_')
      price1 = $(element).children('.offer-price-row').find('.textMain--OAg90RFT').text()
      price2 = $(element).children('.offer-price-row').find('.textMain--OAg90RFT').next().text()
      link1688 = `https://detail.1688.com/offer/${str?.[str?.length - 1]}.html`
      cover2 = $(element).find('.mainImg--KwnHnbbk').attr('src') || ''
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
    this.guessLikeList.clear()
    this.windowService = null
  }
}
