import { CronServices } from './cron.services.js'
import { TaskManager } from './inspection/task-manager.services.js'
import log from '../log/index.js';
export class StartProcessService {
  public static instance: StartProcessService;

  public static getInstance(): StartProcessService {
    if (!StartProcessService.instance) {
      StartProcessService.instance = new StartProcessService()
    }
    return StartProcessService.instance
  }

  async start() {
    const taskManager = TaskManager.getInstance()
    const cronServices = CronServices.getInstance()
    const { data } = await taskManager.getCronTaskList()
    data.forEach(item => {
      try {
        const now = new Date()
        const nextMinute = new Date(
          now.getTime() + 60 * 1000
        )
        const autoExecutionTime = item.autoExecutionTime.split(':')?.[0]
        const expression = `${nextMinute.getMinutes()} ${nextMinute.getHours()} * * *`
        cronServices.register({
          name: item.shopName,
          expression,
          handler: async () => {
            await taskManager.executeTask(item)
          },
          autoStart: true
        })
      } catch (error) {
        log.error(error)
      }
    })
  }
}