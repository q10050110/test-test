import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { CollectionResult, CollectionResultSummary } from './type.js'

/** 管理器只缓存摘要；手动上架时才从磁盘加载商品，避免保留整个历史任务的对象图。 */
export class CollectionResultStore {
  constructor(private readonly directory: string) {}
  async save(
    taskId: string,
    result: CollectionResult,
    signal?: AbortSignal,
  ): Promise<CollectionResultSummary> {
    signal?.throwIfAborted()
    const { upGoodsList, ...summary } = result
    await mkdir(this.directory, { recursive: true })
    await this.atomicWrite(this.file(taskId, 'goods'), upGoodsList, signal)
    await this.atomicWrite(this.file(taskId, 'meta'), summary, signal)
    return summary
  }
  async summary(taskId: string): Promise<CollectionResultSummary | undefined> {
    try {
      return JSON.parse(await readFile(this.file(taskId, 'meta'), 'utf8'))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
      throw error
    }
  }
  async goods(taskId: string): Promise<any[]> {
    return JSON.parse(await readFile(this.file(taskId, 'goods'), 'utf8'))
  }
  async remove(taskId: string) {
    await Promise.all(['goods', 'meta'].map((kind) => rm(this.file(taskId, kind), { force: true })))
  }
  private file(taskId: string, kind: string) {
    return join(this.directory, `${createHash('sha256').update(taskId).digest('hex')}.${kind}.json`)
  }
  private async atomicWrite(file: string, data: unknown, signal?: AbortSignal) {
    const temporary = `${file}.${randomUUID()}.tmp`
    try {
      signal?.throwIfAborted()
      await writeFile(temporary, JSON.stringify(data), { encoding: 'utf8', signal })
      signal?.throwIfAborted()
      await rename(temporary, file)
    } finally {
      await rm(temporary, { force: true })
    }
  }
}
