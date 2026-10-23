import { TaskManager } from './inspection/task-manager.services.js'
export class StartProcessService {
  private static instance: StartProcessService
  static getInstance() { return this.instance ??= new StartProcessService() }
  async start() { await TaskManager.getInstance().restoreScheduledTasks() }
}
