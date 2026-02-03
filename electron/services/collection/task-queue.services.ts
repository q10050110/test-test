import log from "../../log/index.js"

export type TaskHandler<T = any> = (task: any) => Promise<T>
export type SuccessHandle = (id: string) => void
export class TaskQueueService {
  private taskQueue: Map<string, any> = new Map()
  private isProcessing = false
  private activeTasks = 0
  private maxConcurrency = 3
  private completedTasks: any[] = []
  private failedTasks: any[] = []
  private taskHandle: TaskHandler
  private taskIsProcessing: Set<string> = new Set()
  constructor(taskHandle: TaskHandler, maxConcurrency: number = 3) {
    this.maxConcurrency = maxConcurrency
    this.taskHandle = taskHandle
  }

  /**
   * 添加任务到队列
   */
  addTask(task: any[]): void {
    task.forEach(task => {
      this.taskQueue.set(task.id, task)
    })
  }

  /** 
   * 启动任务处理流程
    */
  async startProcessing() {
    if (this.isProcessing || this.activeTasks >= this.maxConcurrency) {
      return;
    }

    this.isProcessing = true;

    const promises: Promise<void>[] = [];

    while (this.taskQueue.size > 0) {
      if (this.activeTasks >= this.maxConcurrency) {
        await new Promise(resolve => setTimeout(resolve, 1500))
        // log.info('队列已满,等待中...')
        continue
      }
      // log.info('队列执行中', this.taskQueue.size)
      const task = this.taskQueue.values().next().value;
      if (!task) continue;

      this.taskQueue.delete(task.id); // 从队列中移除任务
      if (this.taskIsProcessing.has(task.id)) {
        // log.info('跳过已处理的任务');
        continue;
      }

      this.taskIsProcessing.add(task.id);
      this.activeTasks++;

      // log.info(`开始处理任务: ${task.id}, 当前活跃任务数: ${this.activeTasks}`);

      // 并发处理任务
      const taskPromise = this.processTask(task)
        .then(() => {
          this.completedTasks.push(task);
        })
        .catch((error) => {
          log.error(`任务 ${task.id} 处理失败:`, error);
          this.failedTasks.push(task);
        })
        .finally(() => {
          if (this.activeTasks > 0) this.activeTasks--;
          this.taskIsProcessing.delete(task.id);
          // log.info(`任务 ${task.id} 处理完成, 当前活跃任务数: ${this.activeTasks}`);
          this.checkNext(); // 触发下一轮任务处理
        });

      promises.push(taskPromise);
    }

    // 等待所有任务完成
    await Promise.all(promises);

    this.isProcessing = false;
    this.checkNext()
  }

  /** 
   * 处理单个任务
    */
  private async processTask(task: any) {
    await this.taskHandle(task)
  }

  /** 
   * 是否还有任务需要处理
    */
  private checkNext() {
    if (this.taskQueue.size && this.activeTasks < this.maxConcurrency) {
      this.startProcessing()
    }
  }

  /** 
   * 获取队列中的任务数
    */
  getTaskCount(): number {
    return this.taskQueue.size
  }
  /** 
   * 获取正在执行的任务数量
    */
  getActiveCount() {
    return this.activeTasks
  }
  /** 
   * 获取已完成的任务列表
    */
  getCompletedTasksCount() {
    return this.completedTasks.length
  }

  /** 
   * 获取失败的任务列表 
    */
  getFailedTasksCount() {
    return this.failedTasks.length
  }

  /** 
   * 清空队列和状态
    */
  async clear(isRetainCompletedTasks = false) {
    this.taskQueue.clear()
    this.taskIsProcessing.clear()
    this.activeTasks = 0
    if (!isRetainCompletedTasks) this.completedTasks = []
    this.failedTasks = []
  }
}
