import cron, { ScheduledTask } from 'node-cron'

export interface CronTaskOptions {
  /**
   * 任务名称
   */
  name: string
  /**
   * cron表达式
   */
  expression: string
  /**
   * 执行函数
   */
  handler: () => Promise<void> | void
  /**
   * 是否立即启动
   */
  autoStart?: boolean
}

export class CronServices {
  private tasks = new Map<string, ScheduledTask>()
  private static instance: CronServices

  public static getInstance(): CronServices {
    if (!CronServices.instance) {
      CronServices.instance = new CronServices()
    }
    return CronServices.instance
  }
  /** 
   * 获取任务
    */
  getTask(name: string) {
    return this.tasks.get(name)
  }

  /**
  * 添加任务
  */
  register(options: CronTaskOptions) {
    const { name, expression, handler, autoStart = true } = options
    if (this.tasks.has(name)) {
      const oldTask = this.tasks.get(name)
      oldTask?.stop()
      oldTask?.destroy()
      this.tasks.delete(name)
    }
    const task = cron.schedule(expression, async () => {
      await handler()
    }, { timezone: 'Asia/Shanghai' })
    this.tasks.set(name, task)
    autoStart ? task.start() : task.stop()
  }

  /**
  * 停止任务
  */
  stop(name: string) {
    const task = this.tasks.get(name)
    if (task) task.stop()
  }

  /** 
   * 删除任务
    */
  delete(name: string) {
    const task = this.tasks.get(name)
    if (task) {
      task.stop()
      task.destroy()
      this.tasks.delete(name)
    }
  }
  /**
 * 销毁
 */
  destroy() {
    this.tasks.forEach(
      task => {
        task.stop()
        task.destroy()
      }
    )
    this.tasks.clear()
  }
}