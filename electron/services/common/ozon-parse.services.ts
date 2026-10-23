import * as cheerio from 'cheerio'

export interface SellerDataSource {
  getSellingData(url: string, signal?: AbortSignal): Promise<any>
}
export interface SellerSummary {
  available: boolean
  count: number
  minPrice: number
  maxPrice: number
  list: any[]
}

/** 共享站点结构与请求契约；业务子类只扩展字段和节奏，不持有任务状态对象。 */
export class OzonParseService {
  private readonly lifetime = new AbortController()
  protected readonly ozonGoodsData = new Set<string>()
  constructor(protected windowService: SellerDataSource | null) {}

  protected money(value: unknown) {
    return Number(String(value ?? '').replace(/[^\d.,-]/g, '').replace(',', '.')) || 0
  }

  protected productId(href?: string) {
    return href?.match(/-(\d+)(?=[/?#]|$)/)?.[1] ?? href?.match(/\/product\/(\d+)(?=[/?#]|$)/)?.[1]
  }

  protected offersUrl(id: string, domain: string) {
    return `${domain}/api/entrypoint-api.bx/page/json/v2?url=${encodeURIComponent(`/modal/otherOffersFromSellers?product_id=${id}&page_changed=true`)}`
  }

  protected widget(data: any, prefix: string): any {
    const states = data?.widgetStates ?? {}
    const key = Object.keys(states).find(key => key.startsWith(prefix))
    const value = key ? states[key] : undefined
    return typeof value === 'string' ? JSON.parse(value) : value ?? {}
  }

  protected parseCards(html: string, domain: string, signal?: AbortSignal): any[] {
    if (!html) return []
    const $ = cheerio.load(html)
    const goods: any[] = []
    $('#contentScrollPaginator a').each((_index, element) => {
      signal?.throwIfAborted()
      const card = $(element).parent()
      const href = $(element).attr('href')
      const id = this.productId(href)
      if (!id) return
      const price = this.money(card.find('.tsHeadline500Medium').text())
      const oPrice = card.find('.tsBodyControl400Small').text().match(/[\d\s\u2009\u202f.,]+(?=₽)/)?.[0]?.replace(/[\s\u2009\u202f]/g, '')
      const score = (card.find('.tsBodyMBold').text() || card.find('.tsBodyControl300XSmall').text()).replace(/\u202f/g, ' ')
      const match = score.match(/\s*([0-5][.,]\d)\s*(\d[\d\s]*)/) ?? score.match(/\s*([0-5])\s+(\d[\d\s]*)/)
      goods.push({
        id, sku: id, href, link: `https://www.ozon.ru/product/${id}`,
        requestUrl: this.offersUrl(id, domain), price, oPrice,
        cover: $(element).find('img').attr('src'),
        nameLabel: card.find('a').children('div').children('span').text(),
        rating: match?.[1]?.replace(',', '.') ?? 0,
        reviewCountLabel: match?.[2]?.replace(/\s/g, '') ?? 0,
      })
    })
    return goods
  }

  protected sellers(response: any, price: number): SellerSummary {
    const raw = response?.success ? this.widget(response.data, 'webSellerList-').sellers ?? [] : []
    const prices = raw.map((item: any) => this.money(item?.price?.cardPrice?.price)).filter((value: number) => value > 0 && value < price)
    return {
      available: !!response?.success,
      count: raw.length,
      minPrice: prices.length ? Math.min(...prices) : price,
      maxPrice: prices.length ? Math.max(...prices) : price,
      list: raw.map((item: any) => ({
        sku: item.sku, name: item.name, logoImageUrl: item.logoImageUrl,
        coverImage: item.coverImage, price: item.price, rating: item.rating,
        credentials: item.credentials, link: item.link,
      })),
    }
  }

  protected mapGoods(goods: any, sellers: SellerSummary) {
    return { ...goods, sellerNumber: sellers.count || undefined, followMinPrice: sellers.minPrice }
  }

  protected async afterItem(_signal?: AbortSignal) {}

  async ozonListParser(html: string | undefined, domain: string, signal?: AbortSignal) {
    signal = signal ? AbortSignal.any([signal, this.lifetime.signal]) : this.lifetime.signal
    signal?.throwIfAborted()
    const batch = new Set<string>()
    const candidates = this.parseCards(html ?? '', domain, signal).filter(goods => {
      if (this.ozonGoodsData.has(goods.id) || batch.has(goods.id)) return false
      batch.add(goods.id)
      return true
    })
    const result: any[] = []
    for (const goods of candidates) {
      signal?.throwIfAborted()
      if (!this.windowService) throw new Error('解析服务已释放')
      const response = await this.windowService.getSellingData(goods.requestUrl, signal)
      signal?.throwIfAborted()
      result.push(this.mapGoods(goods, this.sellers(response, goods.price)))
      await this.afterItem(signal)
    }
    signal?.throwIfAborted()
    // 一批解析完整返回才提交去重记录；失败、取消后重试不会丢失未返回的商品。
    for (const goods of result) this.ozonGoodsData.add(goods.id)
    return result
  }

  getDataCount() { return this.ozonGoodsData.size }
  destroy() { this.lifetime.abort(new Error('解析服务已释放')); this.ozonGoodsData.clear(); this.windowService = null }
}
