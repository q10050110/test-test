import { ipcMain } from 'electron'
import { operationStore } from '../store/index.ts'
export const storeIpc = () => {
  ipcMain.handle('store-get', (_, key: string) => operationStore.get(key))
  ipcMain.handle('store-set', (_, key: string, value: any) => operationStore.set(key, value))
  ipcMain.handle('store-delete', (_, key: string) => operationStore.delete(key))
}
