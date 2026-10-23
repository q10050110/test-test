import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/** 哈希键、JSON 序列化与单文件原子替换，不依赖业务结果类型。 */
export class JsonFileStoreService {
  constructor(private readonly directory: string) {}

  protected file(key: string, kind: string) {
    if (!/^[a-z0-9-]+$/i.test(kind)) throw new Error('无效的存储类型')
    return join(this.directory, `${createHash('sha256').update(key).digest('hex')}.${kind}.json`)
  }

  protected async readJson<T>(key: string, kind: string): Promise<T> {
    return JSON.parse(await readFile(this.file(key, kind), 'utf8'))
  }

  protected async writeJson(key: string, kind: string, data: unknown, signal?: AbortSignal) {
    signal?.throwIfAborted()
    await mkdir(this.directory, { recursive: true })
    const file = this.file(key, kind)
    const temporary = `${file}.${randomUUID()}.tmp`
    try {
      await writeFile(temporary, JSON.stringify(data), { encoding: 'utf8', signal })
      signal?.throwIfAborted()
      await rename(temporary, file)
    } finally {
      await rm(temporary, { force: true })
    }
  }

  protected async removeJson(key: string, kinds: string[]) {
    await Promise.all(kinds.map(kind => rm(this.file(key, kind), { force: true })))
  }
}
