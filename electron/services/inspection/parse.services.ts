import { OzonParseService, type SellerDataSource, type SellerSummary } from '../common/ozon-parse.services.js'
import { abortableDelay } from '../common/task-scope.services.js'

export class ParseService extends OzonParseService {
  constructor(source: SellerDataSource, private readonly delayMs = () => 100 + Math.random() * 400) { super(source) }

  protected override mapGoods(goods: any, sellers: SellerSummary) {
    return { ...goods, price1: goods.price, oPrice1: goods.oPrice, cover3: goods.cover,
      sellerNumber: sellers.available ? sellers.count : undefined, followMinPrice: sellers.minPrice,
      followMaxPrice: sellers.maxPrice, followList: sellers.list }
  }

  protected override async afterItem(signal?: AbortSignal) { await abortableDelay(this.delayMs(), signal) }
}
