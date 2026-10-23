import * as cheerio from 'cheerio'
import { VerificationFailedError } from '../common/verification-coordinator.services.js'
import { OzonParseService, type SellerSummary, type SellerDataSource } from '../common/ozon-parse.services.js'

export class ParseService extends OzonParseService {
  constructor(source: SellerDataSource, private readonly log: Pick<Console, 'error'> = console) { super(source) }
  readonly guessLikeList = new Set<string>()

  override async ozonListParser(html: string | undefined, domain: string, signal?: AbortSignal) {
    signal?.throwIfAborted()
    if (html && !this.guessLikeList.size) {
      const $ = cheerio.load(html)
      $('[data-widget="skuGrid"] a').each((_index, element) => {
        const id = this.productId($(element).attr('href'))
        if (id) this.guessLikeList.add(this.offersUrl(id, domain))
      })
    }
    return super.ozonListParser(html, domain, signal)
  }

  protected override mapGoods(goods: any, sellers: SellerSummary) {
    return { ...super.mapGoods(goods, sellers), price1: goods.price, oPrice1: goods.oPrice,
      cover3: goods.cover, sellerNumber1: sellers.count || undefined, followMinPrice1: sellers.minPrice }
  }

  /**
   * 商品去重
   */
  async ozonDetailListParser(list: any[]) {
    const result: any[] = []
    for (const item of list) {
      const id = String(item._id ?? '')
      if (!id || this.ozonGoodsData.has(id)) continue
      this.ozonGoodsData.add(id)
      result.push(item)
    }
    return result
  }

  async ozonDetailParse(data: any, domain: string, goods: any, signal?: AbortSignal) {
    signal?.throwIfAborted()
    if (!data.success) return {}
    try {
      const widgetStatesPrice = this.widget(data.data, 'webPrice-')
      const widgetStatesScore = this.widget(data.data, 'webSingleProductScore-')
      const queryUrl = encodeURIComponent(
        `/modal/otherOffersFromSellers?product_id=${goods._id}&page_changed=true`,
      )
      const requestUrl = `${domain}/api/entrypoint-api.bx/page/json/v2?url=${queryUrl}`
      const cleanPrice = (value: unknown) => this.money(value)
      const price = cleanPrice(widgetStatesPrice?.cardPrice || widgetStatesPrice?.price)
      const blackPrice = cleanPrice(widgetStatesPrice?.price)
      const oPrice = cleanPrice(widgetStatesPrice?.originalPrice)
      let str = widgetStatesScore?.text || ''
      const match = str.match(/([0-5](?:\.\d)?)[^0-9]*(\d[\d\s]*)/i)
      const rating = match ? match[1] : 0
      const reviewCountLabel = match ? match[2].replace(/\s/g, '') : 0
      const response = await this.windowService?.getSellingData(requestUrl, signal)
      signal?.throwIfAborted()
      const summary = this.sellers(response, price)
      const sellerNumber = summary.count || undefined
      const sellerNumber1 = sellerNumber
      const followMinPrice = summary.minPrice
      const followMinPrice1 = followMinPrice
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
      signal?.throwIfAborted()
      if (error instanceof VerificationFailedError) throw error
      this.log.error('解析数据失败~~~')
      return {}
    }
  }

  async '1688Parse'(html: any) {
    try {
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
    } catch (error) {
      this.log.error('解析数据失败~~~')
      return { link1688: '', sourcePrice: '', cover2: '' }
    }
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
  override destroy() { this.guessLikeList.clear(); super.destroy() }
}
