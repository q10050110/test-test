<script setup lang="ts">
import {
  CaretRightOutlined,
  PauseCircleFilled,
  SearchOutlined,
  EditOutlined,
  DeleteOutlined,
} from '@ant-design/icons-vue'
import type { Response } from '@/types/index'
import type { Inspection, InspectionList } from '@/types/inspection'
import type { TableColumnsType, TableProps } from 'ant-design-vue'
import InspectionDialog from './components/inspectionDialog.vue'
import { h } from 'vue'
import feedback from '@/utils/feedback'
import dayjs from 'dayjs'
import cLogTab from '@/components/c-log-tab.vue'
import { useTableHeight, useVipCheck } from '@/hooks/index'
const { check } = useVipCheck()
const columns: TableColumnsType<Inspection> = [
  {
    title: '店铺名称',
    dataIndex: 'shopName',
    key: 'shopName',
    width: 120,
  },
  {
    title: '巡查方式',
    dataIndex: 'executionMethod',
    key: 'executionMethod',
    width: 180,
  },
  {
    title: '巡查状态',
    dataIndex: 'status',
    key: 'status',
    width: 120,
  },
  {
    title: '上次执行',
    dataIndex: 'lastRunningTime',
    key: 'lastRunningTime',
    width: 350,
  },
  {
    title: '操作',
    dataIndex: 'operation',
    key: 'operation',
    width: 420,
    fixed: 'right', // 固定列
  },
]

const tableData = ref<Inspection[]>([])
const total = ref()

const taskStatusList = ref([
  {
    label: '未执行',
    value: 'noExecuted',
    color: '',
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
    label: '已失败',
    value: 'failed',
    color: 'error',
  },
  {
    label: '已取消',
    value: 'cancelled',
    color: 'warning',
  },
])

// 新建巡查任务
const inspectionDialogRef = ref<InstanceType<typeof InspectionDialog>>()
const showInspectionDialog = async (data?: Inspection) => {
  await nextTick()
  if (inspectionDialogRef.value) {
    if (data)
      inspectionDialogRef.value.formData = { ...data, taskStatus: data.status, taskId: data._id }
    inspectionDialogRef.value.open = true
  }
}

// 获取巡查任务列表
const loading = ref(false)
const initParams = ref({
  pageNo: 1,
  pageSize: 10,
})
const params = ref({ ...initParams.value })
const getInspectionTaskList = async (reset?: boolean, resetPage?: boolean) => {
  loading.value = true
  if (reset) params.value = { ...initParams.value }
  if (resetPage) params.value.pageNo = 1
  const { data, code, message } = await window.electronAPI.invoke<Response<InspectionList>>(
    'inspection-get-task-list',
    toRaw(params.value),
  )
  if (!code) {
    tableData.value = data.list
    total.value = data.total
    loading.value = false
    return
  }
  feedback.error(message)
  loading.value = false
}
getInspectionTaskList()

// 分页
const pageChange = (page: number, pageSize: number) => {
  params.value.pageNo = page
  params.value.pageSize = pageSize
  getInspectionTaskList()
}

// 删除任务
const deleteHandle = async (record: Inspection) => {
  if (record.status === 'running') return feedback.error('请先终止任务')
  const { data, code } = await window.electronAPI.invoke<Response<string>>(
    'inspection-delete-task',
    { taskIds: [record._id] },
  )
  if (!code) {
    feedback.success('删除成功')
    getInspectionTaskList(false, false)
  }
}

// 格式化时间
const formatDate = (date: number) => {
  return dayjs(date).format('YYYY-MM-DD HH:mm:ss')
}

// 开始任务
let startTimer: number | undefined = undefined
const taskId = ref()
const startHandle = async (record: Inspection) => {
  /*   if (startTimer && taskId.value == record._id) return feedback.error('请勿频繁点击！')
  taskId.value = record._id
  startTimer = setTimeout(() => {
    startTimer = undefined
  }, 3000) */
  const { data: list } = await window.electronAPI.invoke<Response<Inspection[]>>(
    'inspection-get-running-task',
    {},
  )
  if (list.length >= taskQueueCount.value) return feedback.error('任务数量已达上限')
  record.lastRunningTime = formatDate(Date.now())
  const data = toRaw(record)
  const { code, message } = await window.electronAPI.invoke<Response<string>>(
    'inspection-execute-task',
    data,
  )
  if (code) feedback.error(message)
}

// 终止任务
const stopTask = async (record: Inspection) => {
  const data = toRaw(record)
  const { code, message } = await window.electronAPI.invoke<Response<string>>(
    'inspection-stop-task',
    data,
  )
  if (code) feedback.error(message)
}

// 获取任务进度
const tabsRef = ref<InstanceType<typeof cLogTab>>()
const getProgress = async (data?: any) => {
  const { inspectionTask, log } = data
  let obj = tableData.value?.find((item) => item._id === inspectionTask._id)
  if (obj) Object.assign(obj, inspectionTask)
  tabsRef.value?.writeLog(inspectionTask._id, log)
}

// 获取执行中的任务
const getRunningTask = async () => {
  const { data } = await window.electronAPI.invoke<Response<Inspection[]>>(
    'inspection-get-running-task',
    {},
  )
  if (tabsRef.value && data.length) {
    data.forEach((item) => {
      tabsRef.value?.getTaskStackList({ task: item, status: item.status })
    })
  }
}

// 跳转结果页
const router = useRouter()
const goResult = (id: string) => {
  router.push(`/inspection/result?id=${id}`)
}

onMounted(async () => {
  getRunningTask()
  window.electronAPI.on('inspection-progress', getProgress)
})

onUnmounted(() => {
  window.electronAPI.off('inspection-progress', getProgress)
})

const { height, width } = useTableHeight('.table-container', 240, columns)

// 任务队列数量
const taskQueueCount = ref(4)
const taskNumberList = [4, 6, 8, 12]
// 改变采集任务并发数量
const changeTaskQueueCount = () => {
  window.electronAPI.invoke('set-max-concurrent-inspection-task-count', taskQueueCount.value)
}
</script>
<template>
  <div class="inspection-task-page">
    <!-- 表格区域 -->
    <div class="table-container">
      <!-- 新增任务按钮 -->
      <div class="action-bar">
        <a-button type="primary" @click="check(() => showInspectionDialog(undefined))"
          >新增巡查任务</a-button
        >
        <div class="action-right">
          <a-tooltip>
            <template #title
              >为保障软件稳定流畅运行，系统已根据您的设备配置
              智能推荐可同时进行任务数，您可结合电脑运行状态
              与资源占用，手动自定义调整同时运行的任务数量。</template
            >
            <img src="@/assets/view/process.png" class="right-logo" />
          </a-tooltip>
          <a-select
            v-model:value="taskQueueCount"
            style="width: 80px; margin-left: 10px"
            @change="changeTaskQueueCount"
          >
            <a-select-option :value="item" v-for="item in taskNumberList" :key="item">{{
              item
            }}</a-select-option>
          </a-select>
        </div>
      </div>
      <a-table
        :dataSource="tableData"
        :columns="columns"
        :pagination="false"
        rowKey="_id"
        style="margin-bottom: 16px"
        :loading="loading"
        class="table"
        :scroll="{ x: width, y: height }"
      >
        <template #bodyCell="{ column, record }">
          <!-- 店铺名称列 -->
          <template v-if="column.key === 'shopName'">
            <span class="ellipsis-1" style="width: 120px">{{ record.shopName }}</span>
          </template>

          <!-- 巡查方式列 -->
          <template v-if="column.key === 'executionMethod'">
            {{
              record.executionMethod === 'AUTO' ? `自动（每天${record.autoExecutionTime}）` : '手动'
            }}
          </template>

          <!-- 巡查状态列 -->
          <template v-if="column.key === 'status'">
            <a-tag
              :color="taskStatusList.find((item) => item.value === record.status)?.color"
              :bordered="false"
              class="status-tag"
            >
              {{ taskStatusList.find((item) => item.value === record.status)?.label }}
            </a-tag>
          </template>

          <!-- 上次执行列 -->
          <template v-if="column.key === 'lastRunningTime'">
            <div class="execute-time-cell" v-if="record.lastRunningTime">
              {{ formatDate(record.lastRunningTime) }}
              <div v-if="record.status !== 'noExecuted'" class="result-info">
                <span class="success-badge">巡查数量：{{ record.inspectedCount }}</span>
                <span class="warning-badge">被跟数量：{{ record.followedCount }}</span>
              </div>
            </div>
          </template>

          <!-- 操作列 -->
          <template v-if="column.key === 'operation'">
            <div class="operation-cell">
              <a-button
                type="link"
                :icon="h(CaretRightOutlined)"
                v-if="record.status !== 'running'"
                @click="check(() => startHandle(record as Inspection))"
              >
                执行
              </a-button>
              <a-button
                type="link"
                :icon="h(PauseCircleFilled)"
                v-if="record.status === 'running'"
                @click="stopTask(record as Inspection)"
              >
                终止
              </a-button>
              <a-button
                type="link"
                :icon="h(SearchOutlined)"
                @click="goResult(record._id as string)"
              >
                查看
              </a-button>
              <a-button
                type="link"
                :icon="h(EditOutlined)"
                @click="check(() => showInspectionDialog(record as Inspection))"
                :disabled="record.status === 'running'"
              >
                编辑
              </a-button>
              <a-popconfirm
                title="确认删除该任务吗？"
                ok-text="确定"
                cancel-text="取消"
                @confirm="deleteHandle(record as Inspection)"
              >
                <a-button type="link" :icon="h(DeleteOutlined)" danger> 删除 </a-button>
              </a-popconfirm>
            </div>
          </template>
        </template>
      </a-table>

      <!-- 分页器 -->
      <div class="pagination">
        <a-pagination
          v-model:current="params.pageNo"
          :defaultPageSize="params.pageSize"
          :total="total"
          show-less-items
          showQuickJumper
          :show-total="(total) => `共 ${total} 条数据`"
          showSizeChanger
          @change="pageChange"
        />
      </div>
    </div>
    <div class="log">
      <c-log-tab ref="tabsRef" event-name="inspection-task-status-update" name="shopName" />
    </div>
  </div>
  <InspectionDialog ref="inspectionDialogRef" @refresh="getInspectionTaskList(false, false)" />
</template>

<style scoped lang="scss">
.inspection-task-page {
  display: flex;
  flex-direction: column;
  height: 100%;

  .table-container {
    flex: 3;
    overflow: hidden;
    border-radius: 10px;
    background-color: #fff;
    padding: 20px 10px;
    display: flex;
    flex-direction: column;
    .table {
      overflow: hidden;
      flex: 1;
    }
    .action-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      height: 30px;
      margin-bottom: 20px;
      .ant-btn {
        border-radius: 4px;
      }

      .action-right {
        display: flex;
        align-items: center;
        .right-logo {
          width: 20px;
          height: 20px;
        }
      }
    }
    .pagination {
      height: 40px;
      margin-top: 16px;
      text-align: right;
    }
  }

  .log {
    flex: 1;
    margin-top: 20px;
  }

  .status-tag {
    font-size: 12px;
    padding: 2px 8px;
    border-radius: 4px;
    margin: 0 auto;
  }

  .execute-time-cell {
    .result-info {
      display: flex;
      gap: 8px;
      margin-top: 4px;

      .success-badge {
        background-color: #d5f4e3;
        color: #18bd66;
        padding: 2px 6px;
        border-radius: 5px;
        font-size: 14px;
        &::before {
          content: '';
          width: 8px;
          height: 8px;
          display: inline-block;
          border-radius: 50%;
          background-color: #18bd66;
          margin-right: 5px;
        }
      }

      .warning-badge {
        background-color: rgba($color: #faad13, $alpha: 0.2);
        color: #faad13;
        padding: 2px 6px;
        border-radius: 5px;
        font-size: 14px;
        &::before {
          content: '';
          width: 8px;
          height: 8px;
          display: inline-block;
          border-radius: 50%;
          background-color: #faad13;
          margin-right: 5px;
        }
      }
    }
  }

  .operation-cell {
    display: flex;
    .ant-btn-dangerous {
      color: #f5222d;
    }
  }
}
</style>
