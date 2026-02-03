import { TaskManager } from './collection/task-manager.services.js'
import { operationStore } from '../store/index.js'
export class CloseProcessService {
  // 关闭应用时将所有在执行等待执行的任务状态变更为取消
  private async closeTask() {
    await TaskManager.getInstance().stopAllTasks()
  }
  private async deleteAllExcel() {
    await TaskManager.getInstance().deleteAllExcel()
  }
  async run() {
    const token = operationStore.get('token')
    await this.deleteAllExcel()
    if (!token) return
    await this.closeTask()
  }
}