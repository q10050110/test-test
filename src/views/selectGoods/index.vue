<script setup lang="ts">
import type { LogisticsSimpleList, Task } from '@/types/selectGoods';
import type { TableColumnsType, TableProps } from 'ant-design-vue';
import { h } from 'vue'
import { CaretRightOutlined, EditOutlined, CopyOutlined, DownloadOutlined, PauseCircleFilled, SearchOutlined, ExclamationCircleTwoTone } from '@ant-design/icons-vue';
import TaskDialog from './components/taskDialog.vue';
import feedback from '@/utils/feedback';
import Tabs from './components/tabs.vue';
import { getLogisticsSimpleAPI } from '@/api/collection'
// 表单参数
const initParams = ref({
  pageNo: 1,
  pageSize: 10,
  taskName: '',
  taskStatus: undefined
})
const params = ref({ ...initParams.value })

const taskStatusList = ref([
  {
    label: '全部',
    value: undefined,
    color: ''
  },
  {
    label: '未执行',
    value: 'noExecuted',
    color: ''
  },
  {
    label: '待执行',
    value: 'pending',
    color: 'warning'
  },
  {
    label: '执行中',
    value: 'running',
    color: 'processing'
  },
  {
    label: '已完成',
    value: 'completed',
    color: 'success'
  }, {
    label: '失败',
    value: 'failed',
    color: 'error'
  }, {
    label: '取消',
    value: 'cancelled',
    color: 'warning'
  }
])

// 表格数据&配置
const tableData = ref<Task[]>()
const total = ref(0)
const columns = ref<TableColumnsType<Task>>([{
  title: '任务名称',
  dataIndex: 'taskName',
  key: 'taskName',
  width: 250
},
{
  title: '任务状态',
  dataIndex: 'status',
  key: 'status',
  width: 150
},
{
  title: '进度详情',
  dataIndex: 'progress',
  key: 'progress',
  width: 240
}, {
  title: '操作',
  dataIndex: 'action',
  key: 'action'
}
])
const selectData = ref<string[]>()
const rowSelection: TableProps['rowSelection'] = {
  onChange: (selectedRowKeys, selectedRows) => {
    selectData.value = selectedRowKeys as string[]
  }
}
const getTaskList = async (reset?: boolean, resetPage?: boolean) => {
  if (reset) params.value = { ...initParams.value }
  if (resetPage) params.value.pageNo = 1
  const data = await window.electronAPI.invoke('collection-get-all-tasks', toRaw(params.value))
  tableData.value = data.list
  total.value = data.total
  console.log(data.list)
}
getTaskList()

const pageChange = (page: number, pageSize: number) => {
  params.value.pageNo = page;
  params.value.pageSize = pageSize;
  getTaskList()
}

// 新建任务
const dialogRef = ref<InstanceType<typeof TaskDialog>>()
const openTaskDialogHandle = async (data?: Task) => {
  await nextTick()
  if (data?._id && dialogRef.value) dialogRef.value.formData = { ...data }
  dialogRef.value?.openDialog()
}


// 开始任务
const startTask = async (task: Task) => {
  const { code, message } = task.taskStatus === 'noExecuted' ? await window.electronAPI.invoke('collection-start-task', task._id) : await window.electronAPI.invoke('collection-re-execute-task', task._id)
  if (code === 200) return feedback.success('执行任务成功')
  feedback.error(message)
}
// 批量开始任务
const batchStartHandle = async () => {
  selectData.value?.forEach(async item => {
    const task = tableData.value?.find(task => task._id === item)
    if (!task) return
    startTask(task)
    await new Promise(resolve => { setTimeout(resolve, 1000) })
  })
}

// 复制任务
const copyHandle = async (task: Task) => {
  const newTask = JSON.parse(JSON.stringify(task))
  newTask._id = undefined
  newTask.taskStatus = 'noExecuted'
  newTask.taskName = `${task.taskName}-副本`
  const { code, message } = await window.electronAPI.invoke('collection-create', { data: toRaw(newTask) })
  await getTaskList(undefined, true)
  if (code === 200) return feedback.success('复制成功')
  feedback.error(message)
}
// 取消任务
const cancelTask = async (taskId: string) => {
  const { code, message } = await window.electronAPI.invoke('collection-cancel-task', taskId)
  if (code === 200) return feedback.success('取消任务成功')
  feedback.error(message)
}
// 批量删除任务
const deleteTask = async () => {
  if (!selectData.value?.length || !tableData.value?.length) return feedback.error('请选择要删除的任务！')
  const isAlive = tableData.value.filter(item => selectData.value?.includes(item._id!)).some(task => task.taskStatus === 'running')
  if (isAlive) return feedback.error('请将执行的任务终止后，在删除！')
  const res = await feedback.confirm('确定要删除吗,删除以后数据不可在恢复？')
  if (!res) return
  const { code, message } = await window.electronAPI.invoke('collection-delete-task', toRaw(selectData.value))
  await getTaskList(undefined, true)
  if (code === 200) return feedback.success('删除成功')
  feedback.error(message)
}
// 获取任务进度
const tabsRef = ref<InstanceType<typeof Tabs>>()
const getProgress = async (data?: any) => {
  const { collectionTask, log } = data
  let obj = tableData.value?.find(item => item._id === collectionTask._id)
  if (obj) Object.assign(obj, collectionTask)
  tabsRef.value?.writeLog(collectionTask._id, log)
}

// 获取物流信息
const logisticsSimpleList = ref<LogisticsSimpleList>([])
const getLogisticsSimpleList = async () => {
  const { data } = await getLogisticsSimpleAPI()
  logisticsSimpleList.value = data
}
getLogisticsSimpleList()

// 导出表格
const exportHandle = async (taskId: string) => {
  window.electronAPI.invoke('collection-download-excel', taskId)
}
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
        <a-input placeholder="请输入任务名称" style="width: 180px;" v-model:value="params.taskName">
          <template #prefix>
            <SearchOutlined />
          </template>
        </a-input>
      </a-form-item>
      <a-form-item>
        <a-select v-model:value="params.taskStatus" style="width: 120px;" placeholder="请选择状态">
          <a-select-option v-for="item in taskStatusList" :key="item.value" :value="item.value">{{ item.label
          }}</a-select-option>
        </a-select>
      </a-form-item>
      <a-form-item>
        <a-button type="primary" @click="getTaskList(false, true)">查询</a-button>
        <a-button type="primary" style="margin: 0 10px;" @click="openTaskDialogHandle()">新建任务</a-button>
        <a-button type="primary" style="margin-right:10px;" @click="batchStartHandle">批量开始</a-button>
        <a-button type="primary" danger @click="deleteTask">批量删除</a-button>
      </a-form-item>
    </a-form>
    <a-row style="margin-top: 20px;" class="table">
      <a-col :span="24">
        <a-table :dataSource="tableData" :columns="columns" :row-selection="rowSelection" :pagination="false"
          rowKey="_id">
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'taskName'">
              <div style="font-weight: bold; color: #000;width: 250px;" class="ellipsis-2">
                {{ record.taskName }}
              </div>
              <div>
                创建时间：{{ record.createTime }}
              </div>
              <div>
                最近执行：{{ record.updateTime || '-' }}
              </div>
            </template>
            <template v-if="column.key === 'status'">
              <a-tag :color="taskStatusList.find(item => item.value === record.taskStatus)?.color">
                {{taskStatusList.find(item => item.value === record.taskStatus)?.label || '未执行'}}
              </a-tag>
            </template>
            <template v-if="column.key === 'progress'">
              <div>正在处理中商品 <span style="color:#2753ed;">{{ record?.progress?.current || 0 }}</span> 个</div>
              <div>累计已爬取商品 <span style="color: #2753ed;">{{ record?.progress?.total || 0 }}</span> 个</div>
              <div>符合条件商品 <span style="color: #17bd3e;">{{ record?.progress?.totalCount || 0 }}</span> 个</div>
            </template>
            <template v-if="column.key === 'action'">
              <a-button type="link" :icon="h(CaretRightOutlined)"
                v-if="record.taskStatus !== 'running' && record.taskStatus !== 'pending'"
                @click="startTask(record as Task)">开始</a-button>
              <a-button type="link" v-if="record.taskStatus === 'running' || record.taskStatus == 'pending'"
                :icon="h(PauseCircleFilled)" @click="cancelTask(record._id)">终止</a-button>
              <a-tooltip placement="topRight">
                <template #title>
                  <span>任务执行中不允许编辑</span>
                </template>
                <a-button type="link" :icon="h(EditOutlined)" @click="openTaskDialogHandle(record as Task)"
                  :disabled="record.taskStatus === 'running'">编辑</a-button>
              </a-tooltip>
              <a-button type="link" :icon="h(CopyOutlined)" @click="copyHandle(record as Task)">复制</a-button>
              <a-tooltip placement="topRight">
                <template #title>
                  <span>导出符合条件的商品表格</span>
                </template>
                <a-button type="link" :icon="h(DownloadOutlined)" :disabled="!record?.tableFilePath"
                  @click="exportHandle(record?._id)">导出</a-button>
              </a-tooltip>
            </template>
          </template>
        </a-table>
      </a-col>
    </a-row>
    <a-row class="pagination">
      <a-pagination v-model:current="params.pageNo" :defaultPageSize="params.pageSize" :total="total" show-less-items
        :show-total="total => `每页1条 共${total}条记录`" :showSizeChanger="false" @change="pageChange" />
    </a-row>
    <a-row class="tabs">
      <a-col :span="24">
        <Tabs ref="tabsRef" />
      </a-col>
    </a-row>
  </div>
  <TaskDialog ref="dialogRef" @refresh="getTaskList(false, true)" :logisticsSimpleList="logisticsSimpleList" />
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
    z-index: 9999;
  }

  .tabs {
    margin-top: auto;
    padding: 10px 20px;
    background-color: #fff;
    height: 160px;
  }
}
</style>
