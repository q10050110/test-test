import { MainWindowService } from "./main-window.services.js"
import { BatchSaveSellDataParams } from './type.js'
import { batchSaveSellDataAPI, saveSellListDataAPI } from './api.js'
import PQueue from 'p-queue'
export class ProcessService {
  private static instance: ProcessService
  private mainWindow: MainWindowService | null = null
  public static getInstance(): ProcessService {
    if (!ProcessService.instance) {
      ProcessService.instance = new ProcessService()
    }
    return ProcessService.instance
  }

  async start() {

  }
}