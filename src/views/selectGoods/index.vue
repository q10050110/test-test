<script setup lang="ts">
import type { Task } from '@/types/selectGoods';
import type { TableColumnsType, TableProps } from 'ant-design-vue';
import { h } from 'vue'
import { CaretRightOutlined, EditOutlined, CopyOutlined, DownloadOutlined, PauseCircleFilled, SearchOutlined, ExclamationCircleTwoTone } from '@ant-design/icons-vue';
import TaskDialog from './components/taskDialog.vue';
import feedback from '@/utils/feedback';
import Tabs from './components/tabs.vue';

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
const columns = ref<TableColumnsType>([{
  title: '任务名称',
  dataIndex: 'taskName',
  key: 'taskName',
  width: 300
},
{
  title: '任务状态',
  dataIndex: 'status',
  key: 'status',
  width: 200
},
{
  title: '进度详情',
  dataIndex: 'progress',
  key: 'progress'
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
const pagination = ref({
  current: params.value.pageNo,
  pageSize: params.value.pageSize,
  total: total.value,
  showSizeChanger: true,
  showQuickJumper: true,
  showTotal: (total: number) => (`共 ${total} 条`),
  onChange: (page: number, pageSize: number) => {
    params.value.pageNo = page;
    params.value.pageSize = pageSize;
  }
})
const getTaskList = async (reset?: boolean, resetPage?: boolean) => {
  console.log(reset, resetPage, params.value)
  if (reset) params.value = { ...initParams.value }
  if (resetPage) params.value.pageNo = 1
  console.log(params.value)
  const data = await window.electronAPI.invoke('collection-get-all-tasks', toRaw(params.value))
  tableData.value = data.list
  total.value = data.total
}
getTaskList()

// 新建任务
const dialogRef = ref<InstanceType<typeof TaskDialog>>()
const openTaskDialogHandle = async (data?: Task) => {
  await nextTick()
  if (data?._id && dialogRef.value) dialogRef.value.formData = data
  dialogRef.value?.openDialog()
}

// 开始任务
const startTask = async (task: Task) => {
  const { code, message } = task.taskStatus === 'noExecuted' ? await window.electronAPI.invoke('collection-start-task', task._id) : await window.electronAPI.invoke('collection-re-execute-task', task._id)
  if (code === 200) return feedback.success('执行任务成功')
  feedback.error(message)
}
// 复制任务
const copyHandle = async (task: Task) => {
  task._id = undefined
  task.taskName = `${task.taskName}-副本`
  const { code, message } = await window.electronAPI.invoke('collection-create', { data: toRaw(task) })
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
        <a-button type="primary" danger @click="deleteTask">批量删除</a-button>
      </a-form-item>
      <a-form-item>
        <ExclamationCircleTwoTone style="margin-right: 2px;font-size: 20px;vertical-align: middle;"
          :twoToneColor="['#ffffff', '#d9d9d9']" />
        <span style="color:#bab6b9;">任务运行中请勿关闭内置浏览器和软件，关闭任务将全部终止</span>
      </a-form-item>
    </a-form>
    <a-row class="table-wrapper">
      <a-col :span="24">
        <a-table :dataSource="tableData" :columns="columns" :row-selection="rowSelection" :pagination="pagination"
          rowKey="_id">
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'taskName'">
              <p style="font-weight: bold; color: #000">
                {{ record.taskName }}
              </p>
              <p>
                创建时间：{{ record.createTime }}
              </p>
              <p>
                最近执行：{{ record.updateTime || '-' }}
              </p>
            </template>
            <template v-if="column.key === 'status'">
              <a-tag :color="taskStatusList.find(item => item.value === record.taskStatus)?.color">
                {{taskStatusList.find(item => item.value === record.taskStatus)?.label || '未执行'}}
              </a-tag>
            </template>
            <template v-if="column.key === 'progress'">
              <p>正在处理中商品 <span style="color:#2753ed;">{{ record?.progress?.current || 0 }}</span> 个</p>
              <p>累计已爬取商品 <span style="color: #2753ed;">{{ record?.progress?.total || 0 }}</span> 个</p>
              <p>符合条件商品 <span style="color: #17bd3e;">30</span> 个</p>
            </template>
            <template v-if="column.key === 'action'">
              <a-button type="link" :icon="h(CaretRightOutlined)" v-if="record.taskStatus !== 'running'"
                @click="startTask(record as Task)">开始</a-button>
              <a-button type="link" v-if="record.taskStatus === 'running'" :icon="h(PauseCircleFilled)"
                @click="cancelTask(record._id)">终止</a-button>
              <a-button type="link" :icon="h(EditOutlined)" @click="openTaskDialogHandle(record as Task)"
                :disabled="record.taskStatus === 'running'">编辑</a-button>
              <a-button type="link" :icon="h(CopyOutlined)" @click="copyHandle(record as Task)">复制</a-button>
              <a-button type="link" :icon="h(DownloadOutlined)">导出</a-button>
            </template>
          </template>
        </a-table>
      </a-col>
    </a-row>
    <a-row class="tabs">
      <a-col :span="24">
        <Tabs ref="tabsRef" />
      </a-col>
    </a-row>
  </div>
  <TaskDialog ref="dialogRef" @refresh="getTaskList(false, true)" />
</template>

<style lang="scss" scoped>
.select-goods-page {
  display: flex;
  flex-direction: column;
  min-height: 100%;

  .table-wrapper {
    margin: 10px 0;
    flex: 1;
  }

  .tabs {
    margin-top: auto;
    padding: 10px 20px;
    background-color: #fff;
    height: 200px;
  }
}
</style>
