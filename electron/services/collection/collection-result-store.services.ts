import { JsonFileStoreService } from '../common/json-file-store.services.js'
import type { CollectionResult, CollectionResultSummary } from './type.js'

/** 管理器只缓存摘要；手动上架时才从磁盘加载商品，避免保留整个历史任务的对象图。 */
export class CollectionResultStore extends JsonFileStoreService {
  async save(
    taskId: string,
    result: CollectionResult,
    signal?: AbortSignal,
  ): Promise<CollectionResultSummary> {
    signal?.throwIfAborted()
    const { upGoodsList, ...summary } = result
    await this.writeJson(taskId, 'goods', upGoodsList, signal)
    await this.writeJson(taskId, 'meta', summary, signal)
    return summary
  }
  async summary(taskId: string): Promise<CollectionResultSummary | undefined> {
    try {
      return await this.readJson<CollectionResultSummary>(taskId, 'meta')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
      throw error
    }
  }
  async goods(taskId: string): Promise<any[]> {
    return this.readJson<any[]>(taskId, 'goods')
  }
  async remove(taskId: string) {
    await this.removeJson(taskId, ['goods', 'meta'])
  }
}
