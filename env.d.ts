/// <reference types="vite/client" />
interface Window {
  readonly electronAPI: {
    sendMessage: (channel: string, data: any) => void
    onMessage: (channel: string, callback: (data: any) => void) => void
    removeListener: (channel: string) => void
    invoke: <T>(channel: string, data: any) => Promise<T>
    on: (channel: string, callback: (data: any) => void) => void
    off: (channel: string, callback: () => void) => void
  },
  readonly electronStore: {
    get: (key: string) => Promise<any>,
    set: (key: string, value: any) => Promise<any>,
    delete: (key: string) => Promise<any>
  }
}

interface ImportMetaEnv {
  readonly VITE_APP_BASE_URL: string
}