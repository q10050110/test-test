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
        const sellers = JSON.parse(
          response.data.widgetStates?.['webSellerList-4723017-default-1'] || '{}',
        )
        item.sellerNumber = sellers?.sellers?.length || undefined
        const priceList = sellers?.sellers
          ?.map((item: any) => +item?.price?.cardPrice?.price?.replace(/[^\d.]/g, ''))
          .filter((subItem: any) => subItem && subItem < item.price)
        item.sellerNumber1 = item.sellerNumber
        item.followMinPrice = priceList?.length ? Math.min(...priceList) : item.price
        item.followMinPrice1 = item.followMinPrice
        item.followMaxPrice = priceList?.length ? Math.max(...priceList) : item.price
        item.followList = sellers?.sellers || []
      } else {
        item.sellerNumber = undefined
        item.sellerNumber1 = undefined
        item.followMinPrice = item.price
        item.followMinPrice1 = item.price
        item.followMaxPrice = item.price
        item.followList = []
        log.error('获取跟卖数据失败')
      }
    }
    return uniqueData
  }
  /**
   * 商品去重
   */
  async ozonDetailListParser(list: any[]) {
    const uniqueData = list.filter((item) => !this.ozonGoodsData.has(item._id))
    uniqueData.forEach((item) => {
      this.ozonGoodsData.add(item._id)
    })
    return uniqueData
  }
  async ozonDetailParse(data: any, domain: string, goods: any) {
    if (!data.success) return {}
    try {
      const widgetStatesPrice = JSON.parse(
        data.data.widgetStates?.['webPrice-3121879-default-1'] || '{}',
      )
      const widgetStatesScore = JSON.parse(
        data.data.widgetStates?.['webSingleProductScore-3386432-default-1'] || '{}',
      )
      const queryUrl = encodeURIComponent(
        `/modal/otherOffersFromSellers?product_id=${goods._id}&page_changed=true`,
      )
      const requestUrl = `${domain}/api/entrypoint-api.bx/page/json/v2?url=${queryUrl}`
      const cleanPrice = (str: string | undefined) => {
        if (!str) return 0
        return Number(str.replace(/[\s\u2009\u202F₽]/g, '')) || 0
      }
      const price = cleanPrice(widgetStatesPrice?.cardPrice || widgetStatesPrice?.price)
      const blackPrice = cleanPrice(widgetStatesPrice?.price)
      const oPrice = cleanPrice(widgetStatesPrice?.originalPrice)
      let str = widgetStatesScore?.text || ''
      const match = str.match(/([0-5](?:\.\d)?)[^0-9]*(\d[\d\s]*)/i)
      const rating = match ? match[1] : 0
      const reviewCountLabel = match ? match[2].replace(/\s/g, '') : 0
      const response = await this.windowService?.getSellingData(requestUrl)
      let sellers,
        sellerNumber,
        sellerNumber1,
        followMinPrice,
        followMinPrice1 = undefined
      if (response?.success) {
        sellers = JSON.parse(
          response.data.widgetStates?.['webSellerList-4723017-default-1'] || '{}',
        )
        sellerNumber = sellers?.sellers?.length
        const priceList = sellers?.sellers
          ?.map((item: any) => +item?.price?.cardPrice?.price?.replace(/[^\d.]/g, ''))
          .filter((subItem: any) => subItem && subItem < price)
        sellerNumber1 = sellerNumber
        followMinPrice = priceList?.length ? Math.min(...priceList) : price
        followMinPrice1 = priceList?.length ? Math.min(...priceList) : price
      } else {
        sellerNumber = undefined
        sellerNumber1 = undefined
        followMinPrice = price
        followMinPrice1 = price
        log.error('获取跟卖数据失败')
      }
      return {
        id: goods._id,
        price,
        price1: price,
        oPrice,
        oPrice1: oPrice,
        rating,
        reviewCountLabel,
        sellerNumber,
        sellerNumber1,
        followMinPrice,
        followMinPrice1,
        cover: goods.photo,
        nameLabel: goods.name,
        blackPrice,
        ...goods,
      }
    } catch (error) {
      log.error('解析数据失败~~~')
      return {}
    }
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

  async aoXiaParse(html: any) {
    const $ = cheerio.load(html)
    const row = $('.ant-table-row').first()
    const goods = row.find('.infoItem--V27Uh_WV')
    const str = row.attr('data-row-key') || ''
    const cover2 = goods.find('.infoItemContentImg--rjPgLM0F').attr('src') || ''
    const price = goods.find('.infoItemContentInfoPrice--wdNSIanc').text() || ''
    const sourcePrice = Number(price.replace(/[^\d.]/g, '')) || 0
    // 链接
    const link1688 = str ? `https://detail.1688.com/offer/${str}.html` : ''

    return {
      link1688,
      sourcePrice,
      cover2,
    }
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
