import { CronServices } from './cron.services.js'
import { TaskManager } from './inspection/task-manager.services.js'
import { SharpServices } from './sharp.services.js'
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
    const sharpServices = SharpServices.getInstance()
    const result = await sharpServices.findPuzzleTarget('https://cdn2.ozone.ru/s3/abt-challenge/cpt/10/a4a08680.png', 'https://cdn2.ozone.ru/s3/abt-challenge/cpt/10/e87d001c.png')
    console.log(result, '啦啦啦~~~')
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