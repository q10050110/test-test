<script setup lang="ts">
import type { Response } from '@/types/index'
import type {
  InspectionDetailList,
  InspectionDetail,
  GoodsDetail,
  Shop,
  InspectionDetailParams,
} from '@/types/inspection'
import dayjs from 'dayjs'
import chartDialog from './components/chartDialog.vue'
import viewDialog from './components/viewDialog.vue'
import feedback from '@/utils/feedback'
import type { ColumnType } from 'ant-design-vue/es/table'
// 表格数据
const tableData = ref<InspectionDetail[]>([])
// 表格列配置
const columns: ColumnType<InspectionDetail>[] = [
  {
    title: '商品信息',
    dataIndex: 'productInfo',
    key: 'productInfo',
    width: 250,
  },
  {
    title: 'SKU',
    dataIndex: 'goodsId',
    key: 'goodsId',
    width: 180,
  },
  {
    title: '店铺名称',
    dataIndex: 'shopName',
    key: 'shopName',
    width: 124,
  },
  {
    title: '我的售价',
    dataIndex: 'resMoney',
    key: 'resMoney',
    customRender: (record: any) => {
      return `₽${record.text}`
    },
    width: 124,
  },
  {
    title: '跟卖人数',
    dataIndex: 'sellerNumber',
    key: 'sellerNumber',
    customRender: (record: any) => {
      return `${record.text === undefined || record.text === null ? '获取失败' : record.text}`
    },
    width: 104,
  },
  {
    title: '跟卖最低价',
    dataIndex: 'followMinPrice',
    key: 'followMinPrice',
    customRender: (record: any) => {
      return record?.record?.sellerNumber ? `₽${record.text}` : '-'
    },
    width: 124,
  },
  {
    title: '跟卖最高价',
    dataIndex: 'followMaxPrice',
    key: 'followMaxPrice',
    customRender: (record: any) => {
      return record?.record?.sellerNumber ? `₽${record.text}` : '-'
    },
    width: 124,
  },
  {
    title: '巡查时间',
    dataIndex: 'updateTime',
    key: 'updateTime',
    width: 200,
    customRender: (record: any) => {
      return dayjs(record.text).format('YYYY-MM-DD HH:mm:ss')
    },
  },
  {
    title: '操作',
    dataIndex: 'operation',
    key: 'operation',
    width: 300,
    fixed: 'right',
  },
]

const width = columns.reduce((sum, col) => sum + ((col.width as number) || 0), 0)
// 获取巡查任务列表
const loading = ref(false)
const initParams = ref<InspectionDetailParams>({
  pageNo: 1,
  pageSize: 10,
  id: undefined,
  taskId: undefined,
  isFollowed: undefined,
})
const isFollowed = computed({
  get() {
    return params.value.isFollowed === undefined ? undefined : params.value.isFollowed ? 1 : 0
  },
  set(val) {
    params.value.isFollowed = val === 0 ? false : val === undefined ? undefined : true
  },
})
const params = ref<InspectionDetailParams>({ ...initParams.value })
const total = ref(0)
// 分页
const pageChange = (page: number, pageSize: number) => {
  params.value.pageNo = page
  params.value.pageSize = pageSize
  getProductList()
}

// 获取商品列表
const getProductList = async (reset?: boolean, resetPage?: boolean) => {
  loading.value = true
  if (reset) params.value = { ...initParams.value }
  if (resetPage) params.value.pageNo = 1
  const { data, code, message } = await window.electronAPI.invoke<Response<InspectionDetailList>>(
    'inspection-get-goods-list',
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
// 获取店铺列表
const shopList = ref<Shop[]>([])
const getShopList = async () => {
  const { data } = await window.electronAPI.invoke<Response<Shop[]>>('inspection-get-shop-list', {
    pageSize: 999999,
    pageNo: 1,
  })
  shopList.value = data
}
getShopList()
// 方法
const viewRef = ref<InstanceType<typeof viewDialog>>()
const handleView = async (record: InspectionDetail) => {
  if (viewRef.value) {
    viewRef.value.open = true
    viewRef.value.record = record
  }
}

const handleCopy = async (record: InspectionDetail) => {
  try {
    const { data, code, message } = await window.electronAPI.invoke<Response<GoodsDetail>>(
      'inspection-get-goods-detail',
      { taskId: record.taskId, id: record.id },
    )
    const text = data.followList.map((item) => item.sku).join('\n')
    navigator.clipboard.writeText(text)
    feedback.success('复制成功')
  } catch (error) {
    feedback.error('复制失败，请检查是否授予权限')
  }
}

const chartRef = ref<InstanceType<typeof chartDialog>>()
const handleTrend = async (record: InspectionDetail) => {
  if (chartRef.value) {
    chartRef.value.open = true
    await nextTick()
    chartRef.value.initChart(
      record.followTrends.filter(
        (item) => item.sellerNumber !== undefined && item.sellerNumber !== null,
      ),
    )
  }
}

// 复制单个sku
const copyHandle = (text: string) => {
  try {
    navigator.clipboard.writeText(text)
    feedback.success('复制成功')
  } catch (error) {
    feedback.error('复制失败，请检查是否授予权限')
  }
}

// 跳转详情页
const goDetail = (url: string) => {
  window.electronAPI.sendMessage('go-ozon-detail', url)
}

const router = useRoute()
onMounted(() => {
  const id = router.query.id as string
  if (id) params.value.taskId = id
  getProductList()
})
</script>

<template>
  <div class="inspection-page">
    <!-- 搜索区域 -->
    <a-row class="search-bar">
      <a-input
        v-model:value="params.id"
        placeholder="请输入SKU"
        style="width: 200px; margin-right: 16px"
        allowClear
      />
      <a-select
        v-model:value="params.taskId"
        placeholder="选择店铺名称"
        style="width: 180px; margin-right: 16px"
        allowClear
      >
        <a-select-option :value="item._id" v-for="item in shopList" :key="item._id">{{
          item.shopName
        }}</a-select-option>
      </a-select>
      <a-select
        v-model:value="isFollowed"
        placeholder="是否被跟卖"
        style="width: 180px; margin-right: 16px"
        allowClear
      >
        <a-select-option :value="1">是</a-select-option>
        <a-select-option :value="0">否</a-select-option>
      </a-select>
      <a-button type="primary" @click="getProductList(false, true)">查询</a-button>
    </a-row>

    <!-- 商品列表表格 -->
    <a-row class="table-container">
      <a-table
        style="flex: 1"
        :dataSource="tableData"
        :columns="columns"
        :pagination="false"
        rowKey="sku"
        :scroll="{ x: width }"
        :loading="loading"
      >
        <!-- 商品信息列 -->
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'productInfo'">
            <div class="product-info-cell" style="width: 225px">
              <div style="width: 40px; margin-right: 10px">
                <a-tooltip
                  color="white"
                  placement="right"
                  :autoAdjustOverflow="false"
                  :mouseEnterDelay="0"
                >
                  <template #title>
                    <img
                      style="max-height: 200px; max-width: 200px; object-fit: contain"
                      :src="record?.cover"
                      alt=""
                    />
                  </template>
                  <div style="position: relative">
                    <img
                      style="height: 50px; width: 50px; object-fit: contain"
                      :src="record?.cover"
                      alt=""
                    />
                  </div>
                </a-tooltip>
              </div>
              <span
                class="product-name"
                :title="record.nameLabel"
                @click="goDetail(record.link as string)"
                >{{ record.nameLabel }}</span
              >
            </div>
          </template>
          <template v-if="column.key === 'goodsId'">
            <div style="display: flex; align-items: center">
              {{ record.id }}
              <img
                src="@/assets/view/copy-blue.png"
                style="width: 16px; height: 16px; margin-left: 10px; cursor: pointer"
                @click="copyHandle(record.id as string)"
              />
            </div>
          </template>
          <template v-if="column.key === 'operation'">
            <div class="operation-cell">
              <a-button type="link" @click="handleView(record as InspectionDetail)">
                <div style="display: flex; align-items: center">
                  <img
                    src="@/assets/view/view.png"
                    style="width: 16px; height: 16px; margin-right: 4px"
                  />
                  查看
                </div>
              </a-button>
              <a-tooltip>
                <template #title> 复制所有跟卖SKU </template>
                <a-button type="link" @click="handleCopy(record as InspectionDetail)"
                  ><div style="display: flex; align-items: center">
                    <img
                      src="@/assets/view/copy-blue.png"
                      style="width: 16px; height: 16px; margin-right: 4px"
                    />复制
                  </div></a-button
                >
              </a-tooltip>
              <a-tooltip>
                <template #title>保存15天内巡查记录，查看跟卖趋势</template>
                <a-button type="link" @click="handleTrend(record as InspectionDetail)"
                  ><div style="display: flex; align-items: center">
                    <img
                      src="@/assets/view/charts.png"
                      style="width: 16px; height: 16px; margin-right: 4px"
                    />趋势
                  </div></a-button
                >
              </a-tooltip>
            </div>
          </template>
        </template>
      </a-table>
    </a-row>
    <!-- 分页器 -->
    <a-row class="pagination" justify="end">
      <a-pagination
        v-model:current="params.pageNo"
        :defaultPageSize="params.pageSize"
        :total="total"
        show-less-items
        showQuickJumper
        :show-total="(total) => `共 ${total} 条数据`"
        showSizeChange
        @change="pageChange"
      />
    </a-row>
    <chartDialog ref="chartRef" />
    <viewDialog ref="viewRef" />
  </div>
</template>

<style scoped lang="scss">
.inspection-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  padding: 0 10px 20px;
  background-color: #fff;
  border-radius: 10px;
  .search-bar {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 10px 0;
    .ant-input,
    .ant-select-selection-item {
      border-radius: 4px;
    }

    .ant-btn {
      border-radius: 4px;
    }
  }
  .table-container {
    flex: 1;
    overflow: hidden;
    overflow-y: auto;
  }

  .pagination {
    margin-top: 16px;
    height: 40px;
    text-align: right;
  }

  .product-info-cell {
    display: flex;
    align-items: center;

    .product-name {
      flex: 1;
      font-size: 14px;
      color: #1f5fff;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      cursor: pointer;
    }
  }

  .operation-cell {
    display: flex;
    gap: 8px;
  }
}
</style>
