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
        const [hours, minutes] = item.autoExecutionTime.split(':').map(Number);
        const expression = `${minutes} ${hours} * * *`
        cronServices.register({
          name: item._id,
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