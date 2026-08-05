<script setup lang="ts">
import type { Response } from '@/types/index'
import type { InspectionDetailList, InspectionDetail } from '@/types/inspection'
import dayjs from 'dayjs'
// 表格数据
const tableData = ref<InspectionDetail[]>([])

// 表格列配置
const columns = [
  {
    title: '商品信息',
    dataIndex: 'productInfo',
    key: 'productInfo',
    width: '225px',
  },
  {
    title: 'SKU',
    dataIndex: 'goodsId',
    key: 'goodsId',
    width: '138px',
  },
  {
    title: '店铺名称',
    dataIndex: 'shopName',
    key: 'shopName',
  },
  {
    title: '我的售价',
    dataIndex: 'resMoney',
    key: 'resMoney',
    customRender: (record: InspectionDetail) => {
      console.log(record, '嘿嘿')
      return `${record.resMoney}₽`
    },
  },
  {
    title: '跟卖最低价',
    dataIndex: 'followMinPrice',
    key: 'followMinPrice',
  },
  {
    title: '跟卖最高价',
    dataIndex: 'followMaxPrice',
    key: 'followMaxPrice',
  },
  {
    title: '跟卖人数',
    dataIndex: 'sellerNumber',
    key: 'sellerNumber',
  },
  {
    title: '巡查时间',
    dataIndex: 'updateTime',
    key: 'updateTime',
    width: '200px',
    customRender: (record: InspectionDetail) => {
      return dayjs(record.updateTime).format('YYYY-MM-DD HH:mm:ss')
    },
  },
  {
    title: '操作',
    dataIndex: 'operation',
    key: 'operation',
  },
]

// 获取巡查任务列表
const loading = ref(false)
const initParams = ref({
  pageNo: 1,
  pageSize: 10,
  sku: undefined,
  shopName: undefined,
  isFollowed: undefined,
})
const params = ref({ ...initParams.value })
const total = ref(0)
// 分页
const pageChange = (page: number, pageSize: number) => {
  params.value.pageNo = page
  params.value.pageSize = pageSize
  getProductList()
}

// 选中的商品
const selectedProduct = ref(null)
// 获取商品列表
const getProductList = async (reset?: boolean, resetPage?: boolean) => {
  loading.value = true
  if (reset) params.value = { ...initParams.value }
  if (resetPage) params.value.pageNo = 1
  const { data } = await window.electronAPI.invoke<Response<InspectionDetailList>>(
    'inspection-get-goods-list',
    toRaw(params.value),
  )
  tableData.value = data.list
  total.value = data.total
  loading.value = false
}
getProductList()
// 方法
const handleSearch = () => {}

const handleView = (record: any) => {
  selectedProduct.value = record
}

const handleCopy = (record: any) => {
  console.log('复制商品:', record)
}

const handleTrend = (record: any) => {
  console.log('查看趋势:', record)
}
</script>

<template>
  <div class="inspection-page">
    <!-- 搜索区域 -->
    <a-row class="search-bar">
      <a-input
        v-model:value="params.sku"
        placeholder="请输入SKU"
        style="width: 200px; margin-right: 16px"
      />
      <a-select
        v-model:value="params.shopName"
        placeholder="选择店铺名称"
        style="width: 180px; margin-right: 16px"
      >
        <a-select-option value="shop1">测试店铺</a-select-option>
        <a-select-option value="shop2">其他店铺</a-select-option>
      </a-select>
      <a-select
        v-model:value="params.isFollowed"
        placeholder="是否被跟卖"
        style="width: 180px; margin-right: 16px"
      >
        <a-select-option :value="true">是</a-select-option>
        <a-select-option :value="false">否</a-select-option>
      </a-select>
      <a-button type="primary" @click="handleSearch">查询</a-button>
    </a-row>

    <!-- 商品列表表格 -->
    <a-row class="table-container">
      <a-col :span="24">
        <a-table
          :dataSource="tableData"
          :columns="columns"
          :pagination="false"
          rowKey="sku"
          style="margin-bottom: 16px"
        >
          <!-- 商品信息列 -->
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'productInfo'">
              <div class="product-info-cell" style="width: 225px">
                <img
                  :src="record.cover"
                  alt="商品图片"
                  style="width: 40px; height: 40px; object-fit: cover; border-radius: 4px"
                />
                <span class="product-name ellipsis-2" :title="record.nameLabel">{{
                  record.nameLabel
                }}</span>
              </div>
            </template>
            <template v-if="column.key === 'goodsId'">
              {{ record.id }}
            </template>
            <template v-if="column.key === 'operation'">
              <div class="operation-cell">
                <a-button type="link" size="small" @click="handleView(record)">查看</a-button>
                <a-button type="link" size="small" @click="handleCopy(record)">复制</a-button>
                <a-button type="link" size="small" @click="handleTrend(record)">趋势</a-button>
              </div>
            </template>
          </template>
        </a-table>
      </a-col>
    </a-row>
    <!-- 分页器 -->
    <a-row class="pagination" justify="end">
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
    <a-row style="flex: 1"></a-row>
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
    flex: 4;
    overflow: hidden;
    overflow-y: auto;
  }

  .pagination {
    flex: 1;
    margin-top: 16px;
    text-align: right;
  }

  .product-info-cell {
    display: flex;
    align-items: center;
    gap: 8px;

    .product-name {
      font-size: 14px;
      color: #000;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }

  .operation-cell {
    display: flex;
    gap: 8px;

    .ant-btn-link {
      font-size: 12px;
      padding: 0;
    }
  }
}
</style>
