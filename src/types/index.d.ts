export interface Response<T> {
  code: number,
  message: string,
  data: T
}

export type AppInfo = {
  name: string,
  version: string
  path: string
  userDataPath: string
  homePath: string
  tempDirectory: string
}

export interface Params {
  pageNo: number
  pageSize: number
}