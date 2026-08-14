<script setup lang="ts">
import type { Response } from '@/types'
import type { FollowDetail, GoodsDetail, InspectionDetail } from '@/types/inspection'
import feedback from '@/utils/feedback'
import { h } from 'vue'
const open = ref(false)
const tableData = ref<FollowDetail[]>([])

// 表格列配置
const columns = [
  {
    title: '卖家头像',
    dataIndex: 'logoImageUrl',
    customRender: (record: any) => {
      return h('img', {
        src: record.text,
        alt: '',
        style: 'width: 40px; height: 40px; border-radius: 50%; object-fit: cover;',
      })
    },
    width: 120,
  },
  {
    title: '卖家名称',
    dataIndex: 'name',
    key: 'name',
  },
  {
    title: '卖家地区',
    dataIndex: 'credentials',
    customRender: (record: any) => {
      return h('span', { class: 'ellipsis-1', title: record.text?.[2] }, record.text?.[2])
    },
  },
  {
    title: '商品SKU',
    key: 'sku',
    dataIndex: 'sku',
  },
  {
    title: '商品售价',
    dataIndex: 'price',
    sorter: (a: any, b: any) => {
      const priceA = getPrice(a)
      const priceB = getPrice(b)
      return priceA - priceB
    },
    customRender: (record: any) => {
      const priceStr =
        record?.text?.cardPrice?.price?.replace(/\s/g, '') || record.text?.price?.replace(/\s/g, '')
      const price = priceStr.replace(/[^0-9.]/g, '')
      const unit = priceStr.replace(price, '')
      return `${unit}${price}`
    },
  },
  {
    title: '评分',
    dataIndex: 'rating',
    customRender: (record: any) => {
      return record.text?.totalScore ? Number(record.text?.totalScore).toFixed(1) : ''
    },
  },
  {
    title: '评论',
    dataIndex: 'rating',
    customRender: (record: any) => {
      return record.text?.reviewsCount
    },
  },
]

// 复制sku
const getPrice = (record: any) => {
  const priceStr = record?.price?.cardPrice?.price || record?.price
  if (!priceStr) return 0
  const price = typeof priceStr === 'string' ? priceStr : priceStr?.price
  const cleanStr = price.replace(/[^\d.]/g, '')
  return parseFloat(cleanStr) || 0
}
const copySkuHandle = () => {
  const text = tableData.value.map((item) => item.sku).join('\n')
  try {
    navigator.clipboard.writeText(text)
    feedback.success('复制成功')
  } catch (error) {
    feedback.error('复制失败，请检查是否授予权限')
  }
}

// 跳转详情页
const goDetail = (sku: string) => {
  const url = `https://www.ozon.ru/product/${sku}/`
  window.electronAPI.sendMessage('go-ozon-detail', url)
}

// 跳转店铺页
const goShop = (link: string) => {
  const url = `https://www.ozon.ru${link}`
  window.electronAPI.sendMessage('go-ozon-detail', url)
}

const loading = ref(false)
const record = ref<InspectionDetail | null>()
const getData = async (record: InspectionDetail) => {
  loading.value = true
  const { data, code, message } = await window.electronAPI.invoke<Response<GoodsDetail>>(
    'inspection-get-goods-detail',
    { taskId: record.taskId, id: record.id },
  )
  loading.value = false
  if (!code && record._id === data._id) tableData.value = data.followList
}

watch(
  () => record.value?.id,
  async (val) => {
    if (record.value) await getData(record.value)
  },
)

const closeHandle = () => {
  open.value = false
  record.value = null
  tableData.value = []
}

defineExpose({
  open,
  record,
  getData,
})
</script>

<template>
  <a-modal v-model:open="open" :footer="null" style="width: 80vw; height: 500px">
    <a-table
      :dataSource="tableData"
      :columns="columns"
      rowKey="sku"
      style="margin-top: 20px"
      :scroll="{ y: 400 }"
      :pagination="false"
      :loading="loading"
      @cancel="closeHandle"
    >
      <template #headerCell="{ column }">
        <template v-if="column.key === 'sku'">
          <div style="display: flex; align-items: center">
            SKU<img
              src="@/assets/view/copy.png"
              alt=""
              style="width: 16px; height: 16px; margin-left: 5px; cursor: pointer"
              @click="copySkuHandle"
            />
          </div>
        </template>
      </template>
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'name'">
          <span
            style="color: #1f5fff; width: 160px; cursor: pointer"
            class="ellipsis-1"
            :title="record.name"
            @click="goShop(record.link as string)"
            >{{ record.name }}</span
          >
        </template>
        <template v-if="column.key === 'sku'">
          <span style="color: #1f5fff; cursor: pointer" @click="goDetail(record.sku as string)">{{
            record.sku
          }}</span>
        </template>
      </template>
    </a-table>
  </a-modal>
</template>

<style lang="scss" scoped></style>
