export interface InterfaceResult<T> {
  code: number
  data: T
  message: string
}

export interface PageParams {
  pageNo: number
  pageSize: number
}
