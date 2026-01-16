<script setup lang="ts">
import type { Task, TaskStatus } from '@/types/selectGoods';
import type { TableColumnsType, TableProps } from 'ant-design-vue';
import { h } from 'vue'
import dayjs from 'dayjs'
import { CaretRightOutlined, EditOutlined, CopyOutlined, DownloadOutlined, PauseCircleFilled, SearchOutlined } from '@ant-design/icons-vue';
import TaskDialog from './components/taskDialog.vue';

// 表单参数
const params = ref({
  page: 1,
  pageSize: 10
})

const taskStatus = ref<TaskStatus>()
const taskStatusList = ref([{
  label: '未开始',
  value: 'pending',
  color: ''
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
  dataIndex: 'name',
  key: 'name',
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
const rowSelection: TableProps['rowSelection'] = {

  onChange: (selectedRowKeys, selectedRows) => {
  },
}
const pagination = ref({
  current: params.value.page,
  pageSize: params.value.pageSize,
  total: total.value,
  showSizeChanger: true,
  showQuickJumper: true,
  showTotal: (total: number) => (`共 ${total} 条`),
  onChange: (page: number, pageSize: number) => {
    params.value.page = page;
    params.value.pageSize = pageSize;
  }
})

// 标签页
const activeKey = ref('1')

// 新建任务
const dialogRef = ref<InstanceType<typeof TaskDialog>>()
const openTaskDialogHandle = async (data?: Task) => {
  await nextTick()
  if (data?.id && dialogRef.value) dialogRef.value.formData = data
  dialogRef.value?.openDialog()
}
</script>

<template>
  <div class="select-goods-page">
    <a-form class="form" layout="inline">
      <a-form-item>
        <a-input placeholder="请输入任务名称" style="width: 180px;">
          <template #prefix>
            <SearchOutlined />
          </template>
        </a-input>
      </a-form-item>
      <a-form-item>
        <a-select v-model:value="taskStatus" style="width: 120px;" placeholder="请选择状态">
          <a-select-option v-for="item in taskStatusList" :key="item.value" :value="item.value">{{ item.label
          }}</a-select-option>
        </a-select>
      </a-form-item>
      <a-form-item>
        <a-button type="primary">查询</a-button>
        <a-button type="primary" style="margin: 0 10px;" @click="openTaskDialogHandle()">新建任务</a-button>
        <a-button type="primary" danger>批量删除</a-button>
      </a-form-item>
    </a-form>
    <a-row style="margin: 20px 0;">
      <a-col :span="24">
        <a-table :dataSource="tableData" :columns="columns" :row-selection="rowSelection" :pagination="pagination">
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'name'">
              <p style="font-weight: bold; color: #000">
                {{ record.name }}
              </p>
              <p>
                创建时间：{{ record.createTime }}
              </p>
              <p>
                最近执行：{{ record.updateTime || '-' }}
              </p>
            </template>
            <template v-if="column.key === 'status'">
              <a-tag :color="taskStatusList.find(item => item.value === record.status)?.color">
                {{taskStatusList.find(item => item.value === record.status)?.label}}
              </a-tag>
            </template>
            <template v-if="column.key === 'progress'">
              <p>正在处理中商品<span>24</span>个</p>
              <p>累计已爬取商品<span>48</span>个</p>
              <p>符合条件商品<span>30</span>个</p>
            </template>
            <template v-if="column.key === 'action'">
              <a-button type="link" :icon="h(CaretRightOutlined)" v-if="record.status !== 'running'">开始</a-button>
              <a-button type="link" v-if="record.status === 'running'" :icon="h(PauseCircleFilled)">终止</a-button>
              <a-button type="link" :icon="h(EditOutlined)">编辑</a-button>
              <a-button type="link" :icon="h(CopyOutlined)">复制</a-button>
              <a-button type="link" :icon="h(DownloadOutlined)">导出</a-button>
            </template>
          </template>
        </a-table>
      </a-col>
    </a-row>
    <a-row class="tabs">
      <a-col :span="24">
        <a-tabs v-model:activeKey="activeKey">
          <a-tab-pane key="1" tab="Tab 1">Content of Tab Pane 1</a-tab-pane>
          <a-tab-pane key="2" tab="Tab 2" force-render>Content of Tab Pane 2</a-tab-pane>
          <a-tab-pane key="3" tab="Tab 3">Content of Tab Pane 3</a-tab-pane>
        </a-tabs>
      </a-col>
    </a-row>
  </div>
  <TaskDialog ref="dialogRef" />
</template>

<style lang="scss" scoped>
.tabs {
  padding: 20px;
  background-color: #fff;
  height: 200px;
}
</style>
