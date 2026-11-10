import { TaskScope } from './task-scope.services.js'

/** 保持结果顺序；Infinity 直接派发全部项，失败或取消时中止同批操作。 */
export async function mapConcurrent<T, R>(
  items: readonly T[],
  concurrency: number,
  operation: (item: T, index: number, signal: AbortSignal) => Promise<R>,
  signal?: AbortSignal,
): Promise<R[]> {
  if (concurrency !== Infinity && (!Number.isInteger(concurrency) || concurrency < 1)) throw new Error('并发数必须为正整数或 Infinity')
  const scope = new TaskScope(signal)
  const results = new Array<R>(items.length)
  let next = 0
  const worker = async () => {
    while (true) {
      scope.check()
      const index = next++
      if (index >= items.length) return
      results[index] = await scope.run(inner => operation(items[index]!, index, inner), 0)
    }
  }
  try {
    await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker))
    scope.check()
    return results
  } finally { scope.stop() }
}

/** 按间隔启动下一项，间隔与在途请求重叠；可限制在途数量，整批返回前等待所有已启动操作。 */
export async function mapPaced<T, R>(
  items: readonly T[],
  operation: (item: T, index: number, signal: AbortSignal) => Promise<R>,
  between: (signal: AbortSignal) => Promise<unknown>,
  signal?: AbortSignal,
  concurrency = Infinity,
): Promise<R[]> {
  if (concurrency !== Infinity && (!Number.isInteger(concurrency) || concurrency < 1))
    throw new Error('并发数必须为正整数')
  const scope = new TaskScope(signal)
  const pending: Promise<R>[] = []
  const active = new Set<Promise<R>>()
  try {
    for (let index = 0; index < items.length; index++) {
      scope.check()
      while (active.size >= concurrency) await scope.run(() => Promise.race(active), 0)
      scope.check()
      const item = items[index]!
      const currentIndex = index
      const result = scope.run(inner => operation(item, currentIndex, inner), 0)
      active.add(result)
      // 立即观察失败并取消派发间隔和同批请求，不能等到最后 Promise.all 才处理。
      void result.then(() => active.delete(result), error => { active.delete(result); scope.stop(error) })
      pending.push(result)
      if (index < items.length - 1) await scope.run(between, 0)
    }
    scope.check()
    return await Promise.all(pending)
  } finally {
    scope.stop()
    await Promise.allSettled(pending)
  }
}
