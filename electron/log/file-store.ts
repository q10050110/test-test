import { randomUUID } from 'node:crypto'
import {
  appendFileSync,
  closeSync,
  mkdirSync,
  openSync,
  readdirSync,
  statSync,
  unlinkSync,
} from 'node:fs'
import { basename, join } from 'node:path'

export type LogCategory = 'system' | 'business'
export interface LogPolicy {
  maxFileBytes: number
  maxTotalBytes: number
  retentionDays: number
}
const MB = 1024 * 1024
export const LOG_POLICIES: Record<LogCategory, Readonly<LogPolicy>> = {
  system: { maxFileBytes: 10 * MB, maxTotalBytes: 100 * MB, retentionDays: 7 },
  business: { maxFileBytes: 10 * MB, maxTotalBytes: 400 * MB, retentionDays: 14 },
}

export function localLogDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

// 兼容旧的日期日志及 electron-log 的 .old 分卷。
export function logFileInfo(name: string): { date: string; category: LogCategory } | undefined {
  const current = /^(\d{4}-\d{2}-\d{2})\.(system|business)\.[\w-]+\.\d+\.txt$/.exec(name)
  if (current) return { date: current[1]!, category: current[2] as LogCategory }
  const legacy = /^(\d{4}-\d{2}-\d{2})(?:\.old)?\.log$/.exec(name)
  if (legacy) return { date: legacy[1]!, category: 'system' }
}

export function listLogFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && logFileInfo(entry.name))
    .map((entry) => join(directory, entry.name))
    .sort((a, b) => basename(b).localeCompare(basename(a)))
}

interface StoredFile {
  path: string
  date: string
  category: LogCategory
  size: number
  modified: number
}

/** 只负责有界落盘。主进程同步追加，避免异步轮转与写入相互覆盖。 */
export class LogFileStore {
  private readonly files = new Map<string, StoredFile>()
  private readonly active = new Map<LogCategory, StoredFile>()
  private readonly runId = `${Date.now()}-${process.pid}-${randomUUID().slice(0, 8)}`
  private sequence = 0
  private cleanupDate = ''

  constructor(
    private readonly directory: string,
    private readonly policies = LOG_POLICIES,
    private readonly now = () => new Date(),
    private readonly onError: (error: unknown) => void = (error) =>
      console.error('日志写入失败:', error),
  ) {
    for (const policy of Object.values(policies)) {
      if (
        !Number.isSafeInteger(policy.maxFileBytes) ||
        policy.maxFileBytes < 4 ||
        !Number.isSafeInteger(policy.maxTotalBytes) ||
        policy.maxTotalBytes < policy.maxFileBytes ||
        !Number.isInteger(policy.retentionDays) ||
        policy.retentionDays < 1
      )
        throw new Error('日志容量或保留天数配置无效')
    }
    mkdirSync(directory, { recursive: true })
    for (const path of listLogFiles(directory)) {
      const info = logFileInfo(basename(path))!
      const stat = statSync(path)
      this.files.set(path, { path, ...info, size: stat.size, modified: stat.mtimeMs })
    }
    this.cleanup()
  }

  /** 超长记录跨卷保存，按 UTF-8 字符边界拆分，每个文件都不超过上限。 */
  write(category: LogCategory, text: string): boolean {
    try {
      const date = localLogDate(this.now())
      if (this.cleanupDate !== date) this.cleanup()
      const policy = this.policies[category]
      const data = Buffer.from(text.endsWith('\n') ? text : text + '\n', 'utf8')
      let offset = 0
      while (offset < data.length) {
        let file = this.active.get(category)
        if (!file || file.date !== date || file.size >= policy.maxFileBytes)
          file = this.newFile(category, date)
        if (data.length <= policy.maxFileBytes && data.length > policy.maxFileBytes - file.size)
          file = this.newFile(category, date)
        let end = Math.min(data.length, offset + policy.maxFileBytes - file.size)
        // UTF-8 后续字节以 10 开头，不能把它放到下一卷开头。
        while (end < data.length && end > offset && (data[end]! & 0xc0) === 0x80) end--
        if (end === offset) {
          this.newFile(category, date)
          continue
        }
        this.enforceCapacity(category, end - offset, file.path)
        appendFileSync(file.path, data.subarray(offset, end))
        file.size += end - offset
        file.modified = this.now().getTime()
        offset = end
      }
      return true
    } catch (error) {
      // 文件系统错误不传播到采集、巡查或其他业务调用。
      try {
        this.onError(error)
      } catch {
        /* 日志错误回调也不能中断业务。 */
      }
      return false
    }
  }

  private newFile(category: LogCategory, date: string): StoredFile {
    const path = join(
      this.directory,
      `${date}.${category}.${this.runId}.${String(++this.sequence).padStart(6, '0')}.txt`,
    )
    // 独占创建，永远不使用 w 截断已有记录。
    closeSync(openSync(path, 'wx'))
    const file = { path, date, category, size: 0, modified: this.now().getTime() }
    this.files.set(path, file)
    this.active.set(category, file)
    return file
  }

  private remove(file: StoredFile) {
    try {
      unlinkSync(file.path)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    this.files.delete(file.path)
    if (this.active.get(file.category) === file) this.active.delete(file.category)
  }

  private enforceCapacity(category: LogCategory, incoming = 0, protectedPath?: string) {
    const files = [...this.files.values()]
      .filter((file) => file.category === category)
      .sort(
        (a, b) =>
          a.date.localeCompare(b.date) || a.modified - b.modified || a.path.localeCompare(b.path),
      )
    let size = files.reduce((sum, file) => sum + file.size, 0)
    for (const file of files) {
      if (size + incoming <= this.policies[category].maxTotalBytes) break
      if (file.path === protectedPath) continue
      this.remove(file)
      size -= file.size
    }
    if (size + incoming > this.policies[category].maxTotalBytes)
      throw new Error('无法在日志容量上限内写入')
  }

  private cleanup() {
    const today = this.now()
    for (const category of ['system', 'business'] as const) {
      const cutoff = new Date(today)
      cutoff.setDate(cutoff.getDate() - this.policies[category].retentionDays + 1)
      const date = localLogDate(cutoff)
      for (const file of this.files.values()) {
        if (file.category === category && file.date < date) this.remove(file)
      }
      this.enforceCapacity(category)
    }
    this.cleanupDate = localLogDate(today)
  }
}
