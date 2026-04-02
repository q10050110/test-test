<script setup lang="ts">
import type { ConfigList, LogisticsSimpleList, ShopList, Task } from '@/types/selectGoods'
import type { TableColumnsType, TableProps } from 'ant-design-vue'
import { h } from 'vue'
import {
  CaretRightOutlined,
  EditOutlined,
  CopyOutlined,
  DownloadOutlined,
  PauseCircleFilled,
  SearchOutlined,
} from '@ant-design/icons-vue'
import TaskDialog from './components/taskDialog.vue'
import feedback from '@/utils/feedback'
import Tabs from './components/tabs.vue'

import dayjs from 'dayjs'
// 表单参数
const initParams = ref({
  pageNo: 1,
  pageSize: 10,
  taskName: '',
  taskStatus: undefined,
})
const params = ref({ ...initParams.value })

const taskStatusList = ref([
  {
    label: '未执行',
    value: 'noExecuted',
    color: '',
  },
  {
    label: '待执行',
    value: 'pending',
    color: 'warning',
  },
  {
    label: '执行中',
    value: 'running',
    color: 'processing',
  },
  {
    label: '已完成',
    value: 'completed',
    color: 'success',
  },
  {
    label: '失败',
    value: 'failed',
    color: 'error',
  },
  {
    label: '取消',
    value: 'cancelled',
    color: 'warning',
  },
])

// 表格数据&配置
const tableData = ref<Task[]>()
const total = ref(0)
const columns = ref<TableColumnsType<Task>>([
  {
    title: '任务名称',
    dataIndex: 'taskName',
    key: 'taskName',
    width: '28%',
  },
  {
    title: '任务状态',
    dataIndex: 'status',
    key: 'status',
  },
  {
    title: '进度详情',
    dataIndex: 'progress',
    key: 'progress',
  },
  {
    title: '操作',
    dataIndex: 'action',
    key: 'action',
  },
])
const selectData = ref<string[]>()
const rowSelection: TableProps['rowSelection'] = {
  get selectedRowKeys() {
    return selectData.value
  },
  onChange: (selectedRowKeys, selectedRows) => {
    selectData.value = selectedRowKeys as string[]
  },
}
let listTimer: number | undefined = undefined
const getTaskList = async (reset?: boolean, resetPage?: boolean, isThrottle: boolean = false) => {
  if (isThrottle) {
    if (listTimer) return
    listTimer = setTimeout(() => (listTimer = undefined), 500)
  }
  if (reset) params.value = { ...initParams.value }
  if (resetPage) params.value.pageNo = 1
  const data = await window.electronAPI.invoke<any>('collection-get-all-tasks', toRaw(params.value))
  tableData.value = data.list
  total.value = data.total
}
getTaskList()

const pageChange = (page: number, pageSize: number) => {
  params.value.pageNo = page
  params.value.pageSize = pageSize
  getTaskList()
}

// 开始任务
let startTimer: number | undefined = undefined
const taskId = ref()
const startTask = async (task: Task, isThrottle = false) => {
  if (isThrottle) {
    if (startTimer && taskId.value == task._id) return feedback.error('请勿频繁点击！')
    taskId.value = task._id
    startTimer = setTimeout(() => {
      startTimer = undefined
    }, 3000)
  }
  const data = toRaw(task)
  if (data.progress) data.progress = toRaw(data.progress)
  const { code, message } = await window.electronAPI.invoke<any>('collection-create-and-start', {
    data,
    type: 'execute',
  })
  if (code === 200) return feedback.success('执行任务成功')
  feedback.error(message)
}
// 批量开始任务
const isStart = ref(false)
const route = useRoute()
const batchStartHandle = async () => {
  if (isStart.value) return feedback.error('批量执行任务中，请勿频繁点击')
  if (!selectData.value?.length || !tableData.value?.length) {
    feedback.error('请选择要开始的任务！')
    return
  }
  const isRunning = selectData.value.some((taskId) =>
    tableData.value?.some(
      (task) =>
        task._id === taskId && (task.taskStatus === 'running' || task.taskStatus === 'pending'),
    ),
  )
  if (isRunning) return feedback.error('当前选中的任务中存在执行的任务，请稍后重试')
  isStart.value = true
  for (const item of selectData.value) {
    const task = tableData.value?.find((task) => task._id === item)
    if (!task) continue
    if (route.fullPath.includes('login')) return
    await startTask(task)
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }

  selectData.value = []
  isStart.value = false
}

// 复制任务
const timer = ref<number | undefined>(undefined)
const copyHandle = async (task: Task) => {
  if (timer.value) return feedback.error('请勿频繁点击！')
  timer.value = setTimeout(() => {
    timer.value = undefined
  }, 1000)
  task.lastRunningTime = undefined
  const newTask = JSON.parse(JSON.stringify(task))
  const { code, message } = await window.electronAPI.invoke<any>('collection-copy', {
    data: toRaw(newTask),
  })
  await getTaskList(undefined, true)
  if (code === 200) return feedback.success('复制成功')
  feedback.error(message)
}
// 取消任务
const cancelTask = async (taskId: string) => {
  const { code, message } = await window.electronAPI.invoke<any>('collection-cancel-task', taskId)
  if (code === 200) return feedback.success('取消任务成功')
  feedback.error(message)
}
// 批量删除任务
const deleteTask = async () => {
  if (!selectData.value?.length || !tableData.value?.length)
    return feedback.error('请选择要删除的任务！')
  const isAlive = tableData.value
    .filter((item) => selectData.value?.includes(item._id!))
    .some((task) => task.taskStatus === 'running' || task.taskStatus === 'pending')
  if (isAlive) return feedback.error('请将执行、待执行的任务终止后，在删除！')
  const res = await feedback.confirm('确定要删除吗，删除以后数据不可再恢复？')
  if (!res) return
  const { code, message } = await window.electronAPI.invoke<any>(
    'collection-delete-task',
    toRaw(selectData.value),
  )
  await getTaskList(undefined, true)
  if (code === 200) {
    selectData.value = []
    return feedback.success('删除成功')
  }
  feedback.error(message)
}
// 获取任务进度
const tabsRef = ref<InstanceType<typeof Tabs>>()
const getProgress = async (data?: any) => {
  const { collectionTask, log } = data
  let obj = tableData.value?.find((item) => item._id === collectionTask._id)
  if (obj) Object.assign(obj, collectionTask)
  tabsRef.value?.writeLog(collectionTask._id, log)
}

// 获取物流信息
const logisticsSimpleList = ref<LogisticsSimpleList>([])
const getLogisticsSimpleList = async () => {
  const { data, code } = await window.electronAPI.invoke<any>('get-logistics-list', {})
  if (code !== 400) return
  logisticsSimpleList.value = data
}
getLogisticsSimpleList()

const formatDate = (date: string) => {
  if (date) return dayjs(date).format('YYYY-MM-DD HH:mm:ss')
  return '-'
}

// 获取店铺信息
const shopList = ref<ShopList>([])
const getShopList = async () => {
  const { data, code } = await window.electronAPI.invoke<any>('get-shop-list', {})
  if (code !== 400) return
  shopList.value = data
}
getShopList()

// 获取配置信息
const configList = ref<ConfigList>([])
const getConfigList = async () => {
  const { data, code } = await window.electronAPI.invoke<any>('get-config-list', {})
  if (code !== 400) return
  configList.value = data.data
}
getConfigList()
// 导出表格
const exportHandle = async (tableFilePath: string) => {
  try {
    await window.electronAPI.invoke('collection-download-excel', tableFilePath)
  } catch (error) {
    feedback.error(error as string)
  }
}

// 上架
const upGoods = async (task: Task) => {
  const res = await feedback.confirm('是否确认上架表格中的商品？')
  if (!res) return
  const data = toRaw(task)
  data.progress = toRaw(data.progress)
  const { code, message } = await window.electronAPI.invoke<any>('up-goods', data)
  if (code === 200) {
    task.autoResult = 'success'
    feedback.success('上架成功！')
  } else {
    task.autoResult = message
    feedback.error(message)
  }
}
// 新建任务
const dialogRef = ref<InstanceType<typeof TaskDialog>>()
const openTaskDialogHandle = async (data?: Task) => {
  await nextTick()
  if (data?._id && dialogRef.value) {
    if (data.isUseAutoUpGoods) dialogRef.value.mode = data.upDataConfigId ? false : true
    dialogRef.value.formData = { ...data, upMode: data.upMode ? data.upMode : 1 }
  }
  await getConfigList()
  await getShopList()
  dialogRef.value?.openDialog()
}

// 角标背景颜色
const bgColor = (value?: string) => {
  return value ? (value === 'success' ? '#6bb64b' : '#ff7875') : '#1a7aff'
}

const goErp = () => window.electronAPI.sendMessage('go-erp', 'batchRecord')

onMounted(() => {
  window.electronAPI.on('task-progress', getProgress)
})

onUnmounted(() => {
  window.electronAPI.off('task-progress', getProgress)
})
</script>

<template>
  <div class="select-goods-page">
    <a-form class="form" layout="inline">
      <a-form-item>
        <a-input
          placeholder="请输入任务名称"
          style="width: 180px"
          v-model:value="params.taskName"
          @pressEnter="getTaskList(false, true)"
          allowClear
        >
          <template #prefix>
            <SearchOutlined />
          </template>
        </a-input>
      </a-form-item>
      <a-form-item>
        <a-select
          v-model:value="params.taskStatus"
          allowClear
          style="width: 140px"
          placeholder="请选择状态"
        >
          <a-select-option v-for="item in taskStatusList" :key="item.value" :value="item.value">{{
            item.label
          }}</a-select-option>
        </a-select>
      </a-form-item>
      <a-form-item>
        <a-button type="primary" @click="getTaskList(false, true, true)">查询</a-button>
        <a-button type="primary" style="margin: 0 10px" @click="openTaskDialogHandle()"
          >新建任务</a-button
        >
        <a-button type="primary" style="margin-right: 10px" @click="batchStartHandle"
          >批量开始</a-button
        >
        <a-button type="primary" danger @click="deleteTask">批量删除</a-button>
      </a-form-item>
    </a-form>
    <a-row style="margin-top: 20px" class="table">
      <a-col :span="24">
        <a-table
          :dataSource="tableData"
          :columns="columns"
          :row-selection="rowSelection"
          :pagination="false"
          rowKey="_id"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'taskName'">
              <div style="font-weight: bold; color: #000" class="ellipsis-1">
                <div
                  class="autoUp"
                  v-if="record.isUseAutoUpGoods"
                  :style="{ backgroundColor: bgColor(record.autoResult) }"
                  @click="goErp"
                >
                  <a-tooltip v-if="record.autoResult === undefined">
                    <template #title>任务完成后将会自动上架商品</template>
                    <span>上架</span>
                  </a-tooltip>
                  <a-tooltip v-if="record.autoResult === 'success'">
                    <template #title>自动上架成功，可前往【上品帮erp-上架记录查看】</template>
                    <span>已上架</span>
                  </a-tooltip>
                  <a-tooltip v-if="record.autoResult && record.autoResult !== 'success'">
                    <template #title>自动上架失败：{{ record.autoResult }}</template>
                    <span>失败</span>
                  </a-tooltip>
                </div>
                {{ record.taskName }}
              </div>
              <div>创建时间：{{ formatDate(record.createTime) }}</div>
              <div>最近执行：{{ formatDate(record.lastRunningTime) }}</div>
            </template>
            <template v-if="column.key === 'status'">
              <a-tag
                :color="taskStatusList.find((item) => item.value === record.taskStatus)?.color"
              >
                {{
                  taskStatusList.find((item) => item.value === record.taskStatus)?.label || '未执行'
                }}
              </a-tag>
            </template>
            <template v-if="column.key === 'progress'">
              <div>
                正在处理中商品
                <span style="color: #2753ed">{{ record?.progress?.current || 0 }}</span> 个
              </div>
              <div>
                累计已爬取商品
                <span style="color: #2753ed">{{ record?.progress?.total || 0 }}</span> 个
              </div>
              <div>
                符合条件商品
                <span style="color: #17bd3e">{{ record?.progress?.totalCount || 0 }}</span> 个
              </div>
            </template>
            <template v-if="column.key === 'action'">
              <a-button
                type="link"
                :icon="h(CaretRightOutlined)"
                v-if="record.taskStatus !== 'running' && record.taskStatus !== 'pending'"
                @click="startTask(record as Task, true)"
                >开始</a-button
              >
              <a-button
                type="link"
                v-if="record.taskStatus === 'running' || record.taskStatus == 'pending'"
                :icon="h(PauseCircleFilled)"
                @click="cancelTask(record._id)"
                >终止</a-button
              >
              <a-tooltip placement="topRight">
                <template #title>
                  <span>任务执行中不允许编辑</span>
                </template>
                <a-button
                  type="link"
                  :icon="h(EditOutlined)"
                  @click="openTaskDialogHandle(record as Task)"
                  :disabled="record.taskStatus === 'running'"
                  >编辑</a-button
                >
              </a-tooltip>
              <a-button type="link" :icon="h(CopyOutlined)" @click="copyHandle(record as Task)"
                >复制</a-button
              >
              <a-tooltip placement="topRight">
                <template #title>
                  <span>导出符合条件的商品表格</span>
                </template>
                <a-button
                  type="link"
                  :icon="h(DownloadOutlined)"
                  :disabled="!record?.tableFilePath"
                  @click="exportHandle(record?.tableFilePath)"
                  >导出</a-button
                >
              </a-tooltip>
              <a-tooltip placement="topRight" v-if="record.isUseAutoUpGoods">
                <template #title>
                  <span>将表格中的商品上架至OZON后台</span>
                </template>
                <a-button
                  type="link"
                  :icon="h(DownloadOutlined)"
                  :disabled="
                    record?.autoResult === 'success' ||
                    !record?.tableFilePath ||
                    record?.taskStatus === 'noExecuted' ||
                    record?.taskStatus === 'running' ||
                    record?.taskStatus === 'pending'
                  "
                  @click="upGoods(record as Task)"
                  >上架</a-button
                >
              </a-tooltip>
            </template>
          </template>
        </a-table>
      </a-col>
    </a-row>
    <a-row class="pagination">
      <a-pagination
        v-model:current="params.pageNo"
        :defaultPageSize="params.pageSize"
        :total="total"
        show-less-items
        :show-total="(total) => `每页10条 共${total}条记录`"
        :showSizeChanger="false"
        @change="pageChange"
      />
    </a-row>
    <a-row class="tabs">
      <a-col :span="24">
        <Tabs ref="tabsRef" />
      </a-col>
    </a-row>
  </div>
  <TaskDialog
    ref="dialogRef"
    @refresh="getTaskList(false, false)"
    :logisticsSimpleList="logisticsSimpleList"
    :shop-list="shopList"
    :config-list="configList"
  />
</template>

<style lang="scss" scoped>
.select-goods-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;

  .table {
    flex: 1;
    overflow: hidden;
    overflow-y: auto;
  }

  .pagination {
    height: 60px;
    justify-content: flex-end;
    align-items: center;
    margin-bottom: 10px;
  }

  .tabs {
    margin-top: auto;
    padding: 10px 20px;
    background-color: #fff;
    height: 160px;
  }

  .autoUp {
    position: absolute;
    top: 0;
    left: 0;
    width: 40px;
    height: 40px;
    clip-path: polygon(0 0, 0 100%, 100% 0);

    span {
      position: absolute;
      top: 33%;
      left: 33%;
      display: inline-block;
      color: #fff;
      font-weight: 400;
      font-size: 12px;
      transform: translate(-50%, -50%) rotate(-45deg) scale(0.8);
      white-space: nowrap;
    }
  }
}

:deep(.ant-table-cell) {
  position: static !important;
}

:deep(.ant-table-row) {
  position: relative;
}
</style>
