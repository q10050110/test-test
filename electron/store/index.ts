import Store from 'electron-store'

interface Info {
  token: string
}
const store = new Store<Info>({
  name: 'store',
  defaults: {
    token: ''
  }
})

export const operationStore = {
  get: (key: string) => store.get(key),
  set: (key: string, data: any) => store.set(key, data),
  delete: (key: string) => store.delete(key)
}