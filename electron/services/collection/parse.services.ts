import * as cheerio from 'cheerio'
import { MainWindowService } from './main-window.services.js'
import log from '../../log/index.js'

export class ParseService {
  protected ozonGoodsData: Map<string, any> = new Map()
  private windowService: MainWindowService

  constructor(windowService: MainWindowService) {
    this.windowService = windowService
  }
  async ozonListParser($: cheerio.CheerioAPI | undefined, domain: string) {
    const data: any[] = []
    if (!$) return []
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
      const rating = $(element).parent().find('.tsBodyMBold').find('.p6b3_0_6-a4').find('svg').next().text().match(/\d+\.\d+/)?.[0]
      const reviewCountLabel = $(element).parent().find('.tsBodyMBold').find('.p6b3_0_6-a4').next().find('svg').next().text().replace(/[\s\u2009\u202F]/g, '').match(/(\d+)\s*отзывов/)?.[1] || 0;
      const obj = {
        href,
        price: Number(price),
        oPrice,
        // discountLabel: isNaN(Number(discount)) ? discount : `${Number(discount).toFixed(2)}%`,
        link,
        cover,
        name,
        id,
        rating: rating?.slice(0, 3),
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
      this.ozonGoodsData.set(item.id, item)
      uniqueData.push(item)
    }

    for (const item of uniqueData) {
      const response = await this.windowService.getSellingData(item.requestUrl)
      if (response?.success) {
        item.sellerNumber =
          JSON.parse(response.data.widgetStates?.['webSellerList-4723017-default-1'] || '{}')
            ?.sellers?.length || 0
      } else {
        log.error('获取跟卖数据失败')
      }
    }
    return uniqueData
  }

  async '1688Parse'($: cheerio.CheerioAPI, link: any) {
    const str = $('.offerListLayoutWrapper--o0LXuuFm').children('div').first().attr('data-renderkey')?.split('_')
    const price1 = $('.offerListLayoutWrapper--o0LXuuFm').children('div').first().children('.offer-price-row').find('.textMain--s_l2eHVJ').text()
    const price2 = $('.offerListLayoutWrapper--o0LXuuFm').children('div').first().children('.offer-price-row').find('.textMain--s_l2eHVJ').next().text()
    const link1688 = `https://detail.1688.com/offer/${str?.[str?.length - 1]}.html`
    const price = `${price1}${price2}`
    const sourcePrice = isNaN(Number(price)) ? 0 : price
    const cover2 = $('.offerListLayoutWrapper--o0LXuuFm').children('div').find('.mainImg--GT1EYFGa').attr('src')
    return { link1688, sourcePrice, cover2 }
  }

  /** 
   * 获取商品数量
    */
  getDataCount() {
    return this.ozonGoodsData.size
  }

  /** 
   * 清空商品数据
    */
  clearData() {
    this.ozonGoodsData.clear()
  }
}