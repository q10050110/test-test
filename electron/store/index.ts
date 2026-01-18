import Store from 'electron-store'

interface Info {
  token: string
  [key: string]: any
}
export const store = new Store<Info>({
  name: 'store',
  defaults: {
    token: ''
  }
})

export const operationStore = {
  get: (key: string) => (store as any).get(key),
  set: (key: string, data: any) => (store as any).set(key, data),
  delete: (key: string) => (store as any).delete(key)
}