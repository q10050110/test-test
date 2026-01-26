import { TaskManager } from './task-manager.service.js'
import request from '../utils/request.js'
export class CloseProcessService {

  // 关闭应用时将所有在执行等待执行的任务状态变更为取消
  private async closeTask() {
    const { list } = await TaskManager.getInstance().getAllTasks({ pageNo: 1, pageSize: 10000000 })
    const taskList = list.filter((item: any) => item.taskStatus !== 'noExecuted')
    await taskList.forEach(async (item: any) => {
      try {
        await request({
          url: '/api/auto/autoTask/updateStatus',
          method: 'post',
          data: {
            taskId: item._id,
            taskStatus: 'noExecuted',
          },
        });
      } catch (error) {
        console.log(error)
      }
    })
  }

  async run() {
    await this.closeTask()
  }
}