import { TaskManager } from './collection/task-manager.services.js'
import { operationStore } from '../store/index.js'
import { join } from 'node:path'
import { SysTemUtils } from '../utils/system.js'
const excelDir = join(SysTemUtils.getAppInfo().userDataPath, 'excel')
export class CloseProcessService {
  // 关闭应用时将所有在执行等待执行的任务状态变更为取消
  private async closeTask() {
    await TaskManager.getInstance().stopAllTasks()
  }

  async DeleteFolder() {
    await SysTemUtils.fileOperations.deleteFolder(excelDir)
  }

  async run() {
    const token = operationStore.get('token')
    operationStore.set('is-execute-close', true)
    await this.DeleteFolder()
    if (!token) return
    await this.closeTask()
  }
}
