import { createHash } from 'node:crypto'
import { appendFileSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'

export type LogCategory = 'system' | 'business'
export interface LogPolicy {
  retentionDays: number
}
export const LOG_POLICIES: Record<LogCategory, Readonly<LogPolicy>> = {
  system: { retentionDays: 3 },
  business: { retentionDays: 2 },
}

export function localLogDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

// 识别当前文件名，同时兼容旧日期日志和旧分卷，供导出及过期清理使用。
export function logFileInfo(name: string): { date?: string; category: LogCategory } | undefined {
  const daily = /^(\d{4}-\d{2}-\d{2})\.system\.txt$/.exec(name)
  if (daily) return { date: daily[1]!, category: 'system' }
  if (/^business\.[a-zA-Z0-9_-]{1,128}\.txt$/.test(name)) return { category: 'business' }
  const volume = /^(\d{4}-\d{2}-\d{2})\.(system|business)\.[\w-]+\.\d+\.txt$/.exec(name)
  if (volume) return { date: volume[1]!, category: volume[2] as LogCategory }
  const legacy = /^(\d{4}-\d{2}-\d{2})(?:\.old)?\.log$/.exec(name)
  if (legacy) return { date: legacy[1]!, category: 'system' }
}

export function listLogFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true })
    .filter(entry => entry.isFile() && logFileInfo(entry.name))
    .map(entry => join(directory, entry.name))
    .sort((a, b) => b.localeCompare(a))
}

/** 系统按日、业务按任务追加，按各自保留天数清理。 */
export class LogFileStore {
  private cleanupDate = ''

  constructor(
    private readonly directory: string,
    private readonly policies = LOG_POLICIES,
    private readonly now = () => new Date(),
    private readonly onError: (error: unknown) => void = error => console.error('日志写入失败:', error),
  ) {
    for (const policy of Object.values(policies)) {
      if (!Number.isInteger(policy.retentionDays) || policy.retentionDays < 1)
        throw new Error('日志保留天数配置无效')
    }
    mkdirSync(directory, { recursive: true })
    this.cleanup()
  }

  write(category: LogCategory, text: string, taskId?: string): boolean {
    try {
      const date = localLogDate(this.now())
      if (this.cleanupDate !== date) this.cleanup()
      let name = `${date}.system.txt`
      if (category === 'business' && taskId) {
        // 非标准 ID 使用稳定哈希，避免路径穿越、非法文件名和截断碰撞。
        const key = /^[a-zA-Z0-9_-]{1,128}$/.test(taskId)
          ? taskId : createHash('sha256').update(taskId).digest('hex')
        name = `business.${key}.txt`
      }
      appendFileSync(join(this.directory, name), text.endsWith('\n') ? text : text + '\n', 'utf8')
      return true
    } catch (error) {
      try { this.onError(error) } catch { /* 日志错误不影响业务。 */ }
      return false
    }
  }

  cleanup() {
    const today = this.now()
    const cutoffs = {} as Record<LogCategory, string>
    for (const category of ['system', 'business'] as const) {
      const cutoff = new Date(today)
      cutoff.setDate(cutoff.getDate() - this.policies[category].retentionDays + 1)
      cutoffs[category] = localLogDate(cutoff)
    }
    for (const entry of readdirSync(this.directory, { withFileTypes: true })) {
      if (!entry.isFile()) continue
      const info = logFileInfo(entry.name)
      if (!info) continue
      const file = join(this.directory, entry.name)
      try {
        const date = info.date ?? localLogDate(statSync(file).mtime)
        if (date < cutoffs[info.category]) unlinkSync(file)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }
    }
    this.cleanupDate = localLogDate(today)
  }
}
