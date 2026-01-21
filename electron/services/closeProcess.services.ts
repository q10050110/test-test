import { TaskManager } from './task-manager.service.js'
import request from '../utils/request.js'
export class CloseProcessService {

  // 关闭应用时将所有在执行等待执行的任务状态变更为取消
  private closeTask() {
    const taskList = TaskManager.getInstance().getAllTasksList()
    taskList.filter(item => item.taskStatus === 'running' || item.taskStatus === 'pending').forEach(item => {
      request({
        url: '/api/auto/autoTask/updateStatus',
        method: 'post',
        data: {
          taskId: item._id,
          taskStatus: 'cancelled',
        },
      });
    })
  }

  run() {
    this.closeTask()
  }
}