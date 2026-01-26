import request from '../utils/request.js'
export class CloseProcessService {

  // 关闭应用时将所有在执行等待执行的任务状态变更为取消
  private async closeTask() {
    await request({ url: '/api/auto/autoTask/resetStatus', method: 'post', data: {} })
  }

  async run() {
    await this.closeTask()
  }
}