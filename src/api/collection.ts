import type { Params, Response } from '@/types/index'
import request from '@/utils/request'
import type { TaskList, Task, LogisticsSimpleList } from '@/types/selectGoods'
export const getTaskListAPI = (data: Params) =>
  request<Response<TaskList>, Response<TaskList>>({
    url: '/auto/autoTask/getTaskList',
    method: 'post',
    data,
  })

export const getTaskDetailAPI = (data: { taskId: string; token: string }) =>
  request<Response<Task>, Response<Task>>({
    url: '/auto/autoTask/getTaskById',
    method: 'post',
    data,
  })

export const createTaskAPI = (data: Task) =>
  request<Response<null>, Response<null>>({
    url: '/auto/autoTask/createTask',
    method: 'post',
    data,
  })

export const editTaskAPI = (data: Task) =>
  request<Response<null>, Response<null>>({
    url: '/auto/autoTask/editTask',
    method: 'post',
    data,
  })

export const deleteTaskAPI = (data: string[]) =>
  request<Response<null>, Response<null>>({
    url: '/auto/autoTask/deleteBatchTask',
    method: 'post',
    data,
  })

export const getLogisticsSimpleAPI = () =>
  request<Response<LogisticsSimpleList>, Response<LogisticsSimpleList>>({
    url: '/auto/other/getLogisticsSimple',
    method: 'post',
  })
