<script setup lang="ts">
import { QuestionCircleOutlined, SwapOutlined, EditOutlined } from '@ant-design/icons-vue'
import type { FormInstance } from 'ant-design-vue'
import type { Rule } from 'ant-design-vue/es/form'
import type {
  ConfigList,
  LogisticsSimpleList,
  ShopList,
  Task,
  ConditionForm,
} from '@/types/selectGoods'
import feedback from '@/utils/feedback'
import { getShopCurCode } from '@/enums/index'
const props = defineProps<{
  logisticsSimpleList: LogisticsSimpleList
  shopList: ShopList
  configList: ConfigList
}>()

const emits = defineEmits(['refresh', 'refreshConfig'])
const open = ref(false)
const submitting = ref(false)
const mode = ref(true)
const initData = ref<Task>({
  _id: undefined,
  taskStatus: 'noExecuted',
  isUseAutoUpGoods: false,
  stock: undefined,
  client_id: undefined,
  warehouse_id: undefined,
  upDataConfigId: undefined,
  progress: undefined,
  createTime: undefined,
  updateTime: undefined,
  taskName: '',
  targetUrl: '',
  myProfitPercent: undefined,
  internalExpress: undefined,
  rubExpressPrice: undefined,
  elsePercent: undefined,
  sourceType: '0',
  targetCount: undefined,
  targetProfitPercent: undefined,
  brandType: '2',
  soldCountMin: undefined,
  soldCountMax: undefined,
  gmvSumMin: undefined,
  gmvSumMax: undefined,
  salePriceMin: undefined,
  salePriceMax: undefined,
  weightMin: undefined,
  weightMax: undefined,
  upGoodsTimeMin: undefined,
  upGoodsTimeMax: undefined,
  monthDynamicsMin: undefined,
  monthDynamicsMax: undefined,
  adFeeMin: undefined,
  adFeeMax: undefined,
  promotionDayMin: undefined,
  promotionDayMax: undefined,
  promotionDiscountMin: undefined,
  promotionDiscountMax: undefined,
  promotionDynamicsMin: undefined,
  promotionDynamicsMax: undefined,
  promoteDayMin: undefined,
  promoteDayMax: undefined,
  viewsMin: undefined,
  viewsMax: undefined,
  cardRateMin: undefined,
  cardRateMax: undefined,
  showRateMin: undefined,
  showRateMax: undefined,
  salesSchema: 'FBO,FBS',
  followMin: undefined,
  followMax: undefined,
  token: '',
  unit: undefined,
  aiSelectType: 0,
  expendType: false,
  expendShopCount: 1,
  basePriceType: 'originSale',
  rejustType: 'fixed',
  rejustValue: undefined,
  upMode: 2,
  nullableRedemptionRateMax: undefined,
  nullableRedemptionRateMin: undefined,
  ratingMax: undefined,
  ratingMin: undefined,
  clickRateMax: undefined,
  clickRateMin: undefined,
  numberOfCommentsMax: undefined,
  numberOfCommentsMin: undefined,
})
const tooltipLines = ['ai根据商品的竞争力、热度、上架时间等维度，筛选出较有潜力的商品']
const defaultLines = [
  '系统预设选品条件，用于快速筛选出比较有潜力的商品。',
  '可按需修改条件，精准筛选目标商品。',
]
const priceType = [
  {
    label: '商品售价',
    value: 'originSale',
  },
  {
    label: '跟卖最低价',
    value: 'followMin',
  },
]
const regulatingType = [
  {
    label: '固定值',
    value: 'fixed',
  },
  {
    label: '百分比',
    value: 'precent',
  },
]
const formData = ref<Task>({ ...initData.value })
const conditionFormData = ref<ConditionForm>({
  soldCountMin: undefined,
  soldCountMax: undefined,
  gmvSumMin: undefined,
  gmvSumMax: undefined,
  salePriceMin: undefined,
  salePriceMax: undefined,
  ratingMin: undefined,
  ratingMax: undefined,
  clickRateMin: undefined,
  clickRateMax: undefined,
  nullableRedemptionRateMin: undefined,
  nullableRedemptionRateMax: undefined,
  upGoodsTimeMin: undefined,
  upGoodsTimeMax: undefined,
  monthDynamicsMin: undefined,
  monthDynamicsMax: undefined,
  adFeeMin: undefined,
  adFeeMax: undefined,
  promotionDayMin: undefined,
  promotionDayMax: undefined,
  promotionDiscountMin: undefined,
  promotionDiscountMax: undefined,
  promotionDynamicsMin: undefined,
  promotionDynamicsMax: undefined,
  promoteDayMin: undefined,
  promoteDayMax: undefined,
  viewsMin: undefined,
  viewsMax: undefined,
  cardRateMin: undefined,
  cardRateMax: undefined,
  showRateMin: undefined,
  showRateMax: undefined,
  salesSchema: 'FBO,FBS',
  followMin: undefined,
  followMax: undefined,
  numberOfCommentsMin: undefined,
  numberOfCommentsMax: undefined,
  brandType: '2',
})
const rules: Record<string, Rule[]> = {
  taskName: [
    { required: true, message: '请输入任务名称', trigger: ['change', 'blur'] },
    {
      validator: (_, value) => {
        const invalid = /[\\/:*?"<>|]/.test(value)
        if (invalid) {
          return Promise.reject('任务名称不能包含 \\ / : * ? " < > | 等特殊字符')
        }
        return Promise.resolve()
      },
      trigger: ['change', 'blur'],
    },
  ],
  targetUrl: [
    { required: true, message: '请输入网址', trigger: ['change', 'blur'] },
    {
      validator: (_, value) => {
        try {
          const url = new URL(value)
          if (url.hostname.includes('ozon')) return Promise.resolve()
          return Promise.reject('请输入正确的ozon网址')
        } catch (error) {
          return Promise.reject('请输入正确的ozon网址')
        }
      },
      trigger: ['change', 'blur'],
    },
  ],
  sourceType: [{ required: true, message: '请选择货源排序', trigger: ['change', 'blur'] }],
  basePriceType: [{ required: true, message: '请选择定价基准', trigger: ['change', 'blur'] }],
  rejustType: [{ required: true, message: '请选择调整方式', trigger: ['change', 'blur'] }],
  rejustValue: [{ required: true, message: '请输入调整值', trigger: ['change', 'blur'] }],
  // targetProfitPercent: [{ required: true, message: '请输入利润率大于', trigger: ['change', 'blur'] }]
}

const openDialog = () => (open.value = true)

// 创建采集任务
const formRef = ref<FormInstance>()

const cancelHandle = () => {
  open.value = false
  formData.value = { ...initData.value }
  formRef.value?.resetFields()
  mode.value = true
}

const checkRange = (min: number = 0, max: number = 0): boolean => {
  if ((min === undefined && max === undefined) || (min === null && max === null)) return true
  if (!max) return true
  if (isNaN(min) || isNaN(max)) return false
  if (max < min) return false
  return true
}

const filters = [
  // 销量范围校验
  (item: any) => {
    const result = checkRange(formData.value.soldCountMin, formData.value.soldCountMax)
    return result
  },
  // 月销售额范围校验
  (item: any) => {
    const result = checkRange(formData.value.gmvSumMin, formData.value.gmvSumMax)
    return result
  },
  // 销售价格范围校验
  (item: any) => {
    const result = checkRange(formData.value.salePriceMin, formData.value.salePriceMax)
    return result
  },
  // 重量范围校验
  (item: any) => {
    const result = checkRange(formData.value.weightMin, formData.value.weightMax)
    return result
  },
  // 上架时间范围校验
  (item: any) => {
    const result = checkRange(formData.value.upGoodsTimeMin, formData.value.upGoodsTimeMax)
    return result
  },
  // 月销售动态范围校验
  (item: any) => {
    const result = checkRange(formData.value.monthDynamicsMin, formData.value.monthDynamicsMax)
    return result
  },
  // 广告份额范围校验
  (item: any) => {
    const result = checkRange(formData.value.adFeeMin, formData.value.adFeeMax)
    return result
  },
  // 参与促销天数范围校验
  (item: any) => {
    const result = checkRange(formData.value.promotionDayMin, formData.value.promotionDayMax)
    return result
  },
  // 参与促销折扣范围校验
  (item: any) => {
    const result = checkRange(
      formData.value.promotionDiscountMin,
      formData.value.promotionDiscountMax,
    )
    return result
  },
  // 促销活动转化率范围校验
  (item: any) => {
    const result = checkRange(
      formData.value.promotionDynamicsMin,
      formData.value.promotionDynamicsMax,
    )
    return result
  },
  // 付费推广天数范围校验
  (item: any) => {
    const result = checkRange(formData.value.promoteDayMin, formData.value.promoteDayMax)
    return result
  },
  // 浏览量范围校验
  (item: any) => {
    const result = checkRange(formData.value.viewsMin, formData.value.viewsMax)
    return result
  },
  // 商品卡片加购率范围校验
  (item: any) => {
    const result = checkRange(formData.value.cardRateMin, formData.value.cardRateMax)
    return result
  },
  // 搜索和目录加购率范围校验
  (item: any) => {
    const result = checkRange(formData.value.showRateMin, formData.value.showRateMax)
    return result
  },
  // 跟卖人数范围校验
  (item: any) => {
    const result = checkRange(formData.value.followMin, formData.value.followMax)
    return result
  },
  // 评论数范围校验
  (item: any) => {
    const result = checkRange(item.numberOfCommentsMin, item.numberOfCommentsMax)
    return result
  },
  // 评分范围校验
  (item: any) => {
    const result = checkRange(item.ratingMin, item.ratingMax)
    return result
  },
  // 点击率范围校验
  (item: any) => {
    const result = checkRange(item.clickRateMin, item.clickRateMax)
    return result
  },
  // 成交率范围校验
  (item: any) => {
    const result = checkRange(item.nullableRedemptionRateMin, item.nullableRedemptionRateMax)
    return result
  },
]
const saveOldFormdata = () => {
  const keys = Object.keys(conditionFormData.value) as (keyof ConditionForm)[]
  Object.assign(
    conditionFormData.value,
    Object.fromEntries(keys.map((k) => [k, formData.value[k]])),
  )
}

// 选品条件变化
watch(
  () => formData.value.aiSelectType,
  (newVal, oldVal) => {
    if (oldVal === 1) saveOldFormdata()
    if (newVal === 2) {
      const keys = Object.keys(conditionFormData.value) as (keyof ConditionForm)[]
      keys.forEach((key) => {
        if (key === 'salesSchema') formData.value[key] = 'FBO,FBS'
        if (key === 'brandType') formData.value[key] = '2'
        if (key !== 'salesSchema' && key !== 'brandType') formData.value[key] = undefined
      })
      formData.value.soldCountMin = 50
      formData.value.monthDynamicsMin = 10
      formData.value.followMax = 30
      formData.value.ratingMin = 4
    }
    if (newVal === 1) {
      formData.value = { ...formData.value, ...conditionFormData.value }
    }
  },
)
// 关闭自动上架清空配置项
watch(
  () => formData.value.isUseAutoUpGoods,
  (newVal) => {
    if (!newVal) {
      formData.value.stock = undefined
      formData.value.warehouse_id = undefined
      formData.value.client_id = undefined
      formData.value.upDataConfigId = undefined
    }
  },
)

// 获取转换单位
watch(
  () => formData.value.client_id,
  (newVal) => {
    if (newVal) {
      const currency_code = props.shopList.find((item) => item.client_id === newVal)?.currency_code
      if (currency_code)
        formData.value.unit = getShopCurCode(
          currency_code as 'CNY' | 'USD' | 'RUB' | 'EUR' | 'BYN' | 'KZT',
        )
    }
  },
)

watch(
  () => formData.value.upDataConfigId,
  (newVal) => {
    if (newVal) {
      const obj = props.configList.find((item) => item._id === newVal)
      if (obj && obj.shopData.length) {
        const shop = obj.shopData[0]
        formData.value.client_id = shop?.client_id
        const currency_code = props.shopList.find(
          (item) => item.client_id === shop?.client_id,
        )?.currency_code
        if (currency_code)
          formData.value.unit = getShopCurCode(
            currency_code as 'CNY' | 'USD' | 'RUB' | 'EUR' | 'BYN' | 'KZT',
          )
      }
    }
  },
)

const saveHandle = async (type: 'save' | 'execute') => {
  try {
    await formRef.value?.validate()
  } catch (error) {
    feedback.error('请完善表单报错项')
    return
  }

  if (formData.value.isUseAutoUpGoods) {
    if (!formData.value.client_id && !formData.value.upDataConfigId)
      return feedback.error('您当前已开启自动上架，请完善上架配置信息')
    if (
      !formData.value.myProfitPercent &&
      formData.value.myProfitPercent !== 0 &&
      formData.value.upMode !== 2
    )
      return feedback.error('您当前已开启自动上架，请填写我的利润率')
  }

  if (formData.value.upMode === 2) {
    if (!formData.value.basePriceType) return feedback.error('请选择商品价格类型')
    if (!formData.value.rejustType) return feedback.error('请选择商品价格类型')
    if (!formData.value.rejustValue) return feedback.error('请填写商品价格调整值')
  }

  if (formData.value.expendType && !formData.value.expendShopCount)
    return feedback.error('请填写需要拓展的店铺数量')

  if (formData.value.upDataConfigId) {
    const obj = props.configList.find((item) => item._id === formData.value.upDataConfigId)
    if (obj && !obj.shopData.length) return feedback.error('该配置无店铺，请检查后再上架')
  }

  if (filters.some((item) => !item(formData.value))) {
    return feedback.error('最小值不能超过最大值')
  }

  if (+(formData.value.myProfitPercent || 0) + +(formData.value.elsePercent || 0) > 100) {
    return feedback.error('利润率与其他费用加起来不能大于100%')
  }

  submitting.value = true

  try {
    const data = JSON.parse(JSON.stringify(formData.value))

    const { code, message } =
      type === 'execute'
        ? await window.electronAPI.invoke<any>('collection-create-and-start', { data, type })
        : await window.electronAPI.invoke('collection-create', { data: data, type })

    if (code === 200) {
      emits('refresh')
      feedback.success('操作成功')
      cancelHandle()
      return
    }
    feedback.error(message)
  } finally {
    submitting.value = false
  }
}

/* 切换新旧版 */
const changeVersion = computed({
  get() {
    return formData.value.upMode
  },
  set(val) {
    if (val === 1) {
      formData.value.basePriceType = undefined
      formData.value.rejustType = undefined
      formData.value.rejustValue = undefined
    } else {
      formData.value.myProfitPercent = undefined
    }
    formData.value.internalExpress = undefined
    formData.value.rubExpressPrice = undefined
    formData.value.elsePercent = undefined
    formData.value.upMode = val
  },
})
/* 自动上架 */
// 切换自动上架配置时清空之前的配置信息
const changeMode = computed({
  get() {
    return mode.value
  },
  set(value) {
    if (!value) {
      formData.value.stock = undefined
      formData.value.warehouse_id = undefined
      formData.value.client_id = undefined
      const obj = props.configList.find((item) => item.isDefault)
      if (obj && formData.value.isUseAutoUpGoods) formData.value.upDataConfigId = obj._id
    } else {
      formData.value.client_id = undefined
      formData.value.upDataConfigId = undefined
    }
    mode.value = value
  },
})

// 获取仓库信息
const clientList = computed(() => {
  const obj = props.shopList.find((item) => item.client_id === formData.value.client_id)
  return obj ? obj.warehouse : []
})

// 跳转到ERP配置页
const goErp = () => {
  window.electronAPI.sendMessage('go-erp', 'upGoodsSetting')
}

const changeHandle = (val?: 'followMin' | 'originSale') => {
  formData.value.rejustType = val ? formData.value.rejustType : undefined
  formData.value.basePriceType = undefined
  formData.value.basePriceType = val
}

const autoUpHandle = async (val: any) => {
  if (val) {
    const res = await feedback.confirm('请确认是否开启', {
      title: '该开关开启会将自动化助手选出的商品自动上架',
    })
    if (res) formData.value.isUseAutoUpGoods = val
    return
  }
  formData.value.isUseAutoUpGoods = val
}
defineExpose({
  mode,
  formData,
  openDialog,
  saveOldFormdata,
})
</script>
<template>
  <div class="task-page">
    <a-modal
      v-model:open="open"
      :title="formData._id ? '编辑任务' : '新增任务'"
      @cancel="cancelHandle"
      width="900px"
      destroy-on-close
      :maskClosable="false"
    >
      <div class="dialog-content">
        <a-form
          :model="formData"
          layout="vertical"
          :label-col="{ span: 24 }"
          :wrapper-col="{ span: 24 }"
          :rules="rules"
          ref="formRef"
          class="form"
        >
          <!-- 基础信息 -->
          <section class="form-section">
            <h3 class="section-title">基础信息</h3>
            <a-row :gutter="[16, 16]">
              <a-col :span="12">
                <a-form-item required label="任务名称" name="taskName">
                  <a-input placeholder="请输入任务名称" v-model:value="formData.taskName" />
                </a-form-item>
              </a-col>
              <a-col :span="12">
                <a-form-item>
                  <template #label>
                    <label class="flex-center">
                      目标数量
                      <a-tooltip
                        title="执行任务需要导出的商品数量，数量越大，则耗时越长。若长时间未能找到符合条件的商品，任务可能自动结束，导出的商品数量可能小于该值。"
                      >
                        <QuestionCircleOutlined class="info-icon" />
                      </a-tooltip>
                    </label>
                  </template>
                  <a-input-number
                    placeholder="请输入目标数量"
                    v-model:value="formData.targetCount"
                    :min="1"
                  />
                </a-form-item>
              </a-col>
            </a-row>
            <a-row :gutter="[16, 16]">
              <a-col :span="12">
                <a-form-item required name="targetUrl">
                  <template #label>
                    <label class="flex-center">
                      OZON前台链接
                      <a-tooltip
                        title="支持OZON商城的列表页，如：类目链接、店铺链接、搜索结果页链接"
                      >
                        <QuestionCircleOutlined class="info-icon" />
                      </a-tooltip>
                    </label>
                  </template>
                  <a-input placeholder="请输入URL" v-model:value="formData.targetUrl" />
                </a-form-item>
              </a-col>
            </a-row>
            <a-row :gutter="[16, 16]">
              <a-col :span="12">
                <a-form-item required>
                  <template #label>
                    <label class="flex-center">
                      扩店模式
                      <a-tooltip title="程序自动寻找跟卖者店铺，或者商品相关的卖家店铺，进行选品">
                        <QuestionCircleOutlined class="info-icon" />
                      </a-tooltip>
                    </label>
                  </template>
                  <a-switch v-model:checked="formData.expendType" />
                </a-form-item>
              </a-col>
            </a-row>
            <a-row :gutter="[16, 16]" v-if="formData.expendType">
              <a-col :span="12">
                <a-form-item required>
                  <template #label>
                    <label class="flex-center">
                      扩展店铺数量
                      <a-tooltip title="程序需要自动寻找符合的店铺数量">
                        <QuestionCircleOutlined class="info-icon" />
                      </a-tooltip>
                    </label>
                  </template>
                  <a-input-number
                    placeholder="请输入目标数量"
                    v-model:value="formData.expendShopCount"
                    :min="1"
                  />
                </a-form-item>
              </a-col>
            </a-row>
          </section>
          <!-- 自动上架 -->
          <section class="form-section">
            <h3 class="section-title">
              <span>自动上架</span>
              <a-tooltip title="开启后，任务结束后将自动上架所有符合条件的商品">
                <QuestionCircleOutlined class="info-icon" />
              </a-tooltip>
              <a-switch
                :checked="formData.isUseAutoUpGoods"
                size="default"
                style="margin-left: 10px"
                @change="autoUpHandle"
              />
            </h3>
            <a-row :gutter="[16, 16]">
              <template v-if="changeMode">
                <a-col :span="8">
                  <a-form-item>
                    <template #label>
                      <span>选择店铺</span>
                      <div class="auto-col" @click="changeMode = !changeMode">
                        <SwapOutlined />
                        <span>{{ changeMode ? '上架配置' : '单店铺' }}</span>
                      </div>
                    </template>
                    <a-select
                      placeholder="请选择店铺"
                      v-model:value="formData.client_id"
                      style="width: 200px"
                      allowClear
                      :disabled="!formData.isUseAutoUpGoods"
                      :get-popup-container="(triggerNode) => triggerNode.parentNode"
                      @change="formData.warehouse_id = undefined"
                    >
                      <a-select-option
                        :value="item.client_id"
                        v-for="item in shopList"
                        :key="item.client_id"
                      >
                        {{ item.shop_name }}
                      </a-select-option>
                    </a-select>
                  </a-form-item>
                </a-col>
                <a-col :span="8">
                  <a-form-item label="选择仓库">
                    <a-select
                      placeholder="请选择仓库"
                      v-model:value="formData.warehouse_id"
                      style="width: 200px"
                      allowClear
                      :disabled="!formData.isUseAutoUpGoods"
                      :get-popup-container="(triggerNode) => triggerNode.parentNode"
                    >
                      <a-select-option
                        :value="item.warehouse_id"
                        v-for="item in clientList"
                        :key="item.warehouse_id"
                      >
                        {{ item.name }}
                      </a-select-option>
                    </a-select>
                  </a-form-item>
                </a-col>
                <a-col :span="8">
                  <a-form-item label="库存">
                    <a-input-number
                      placeholder="请输入库存"
                      v-model:value="formData.stock"
                      :disabled="!formData.isUseAutoUpGoods || !formData.warehouse_id"
                      :min="0"
                    ></a-input-number>
                  </a-form-item>
                </a-col>
              </template>
              <template v-else>
                <a-col :span="8">
                  <a-form-item>
                    <template #label>
                      <span>选择上架配置</span>
                      <div class="auto-col" @click="changeMode = !changeMode">
                        <SwapOutlined />
                        <span>{{ changeMode ? '上架配置' : '单店铺' }}</span>
                      </div>
                    </template>
                    <div style="display: flex">
                      <a-select
                        placeholder="请选择上架配置"
                        v-model:value="formData.upDataConfigId"
                        style="width: 200px"
                        allowClear
                        :disabled="!formData.isUseAutoUpGoods"
                        :get-popup-container="(triggerNode) => triggerNode.parentNode"
                        @dropdownVisibleChange="emits('refreshConfig')"
                      >
                        <a-select-option
                          :value="item._id"
                          v-for="item in configList"
                          :key="item._id"
                        >
                          {{ item.name }}
                        </a-select-option>
                      </a-select>
                      <div class="auto-col" style="display: flex" @click="goErp">
                        <EditOutlined />
                        <a-button type="link">修改配置</a-button>
                        <a-tooltip
                          title="【跳转到默认浏览器打开ERP修改上架配置，请确保登陆的账号一致。
修改配置后请重新选择上架配置获取最新数据】"
                        >
                          <QuestionCircleOutlined class="info-icon" />
                        </a-tooltip>
                      </div>
                    </div>
                  </a-form-item>
                </a-col>
              </template>
            </a-row>
          </section>
          <!-- 商品定价 -->
          <section class="form-section">
            <h3 class="section-title" style="display: flex; justify-content: space-between">
              <div>
                <span style="margin-right: 5px">商品定价</span>
                <a-tooltip title="对符合条件的商品，进行定价">
                  <QuestionCircleOutlined class="info-icon" />
                </a-tooltip>
              </div>
              <div class="auto-col" @click="changeVersion = changeVersion === 1 ? 2 : 1">
                <SwapOutlined style="margin-right: 5px" />
                <span>{{ changeVersion === 1 ? '切换新版' : '切换旧版' }}</span>
              </div>
            </h3>
            <div v-if="formData.upMode === 1">
              <a-row :gutter="[16, 16]">
                <a-col :span="12">
                  <a-form-item name="myProfitPercent">
                    <template #label>
                      <label class="flex-center">
                        我的利润率
                        <a-tooltip
                          title="利润率就是利润/售价，利润：售价 - （货源+其他费用+国内运费+尾程派送+国际物流费+rfbs佣金）"
                        >
                          <QuestionCircleOutlined class="info-icon" />
                        </a-tooltip>
                      </label>
                    </template>
                    <a-input-number
                      placeholder="请输入利润率"
                      v-model:value="formData.myProfitPercent"
                      style="width: 100%"
                      addon-after="%"
                    />
                  </a-form-item>
                </a-col>
                <a-col :span="12">
                  <a-form-item label="国际物流" name="internalExpress">
                    <a-select
                      placeholder="请选择物流"
                      v-model:value="formData.internalExpress"
                      allowClear
                      :get-popup-container="(triggerNode) => triggerNode.parentNode"
                    >
                      <a-select-option
                        :value="item.value"
                        v-for="item in logisticsSimpleList"
                        :key="item.value"
                      >
                        {{ item.label }}
                      </a-select-option>
                    </a-select>
                  </a-form-item>
                </a-col>
              </a-row>
              <a-row :gutter="[16, 16]">
                <a-col :span="12">
                  <a-form-item label="国内运费" name="rubExpressPrice">
                    <a-input-number
                      placeholder="请输入国内运费+代贴单"
                      v-model:value="formData.rubExpressPrice"
                      style="width: 100%"
                      addon-after="￥"
                    />
                  </a-form-item>
                </a-col>
                <a-col :span="12">
                  <a-form-item label="其他（提现、货损等）" name="elsePercent">
                    <a-input-number
                      placeholder="请输入其他费用"
                      v-model:value="formData.elsePercent"
                      style="width: 100%"
                      addon-after="%"
                    />
                  </a-form-item>
                </a-col>
              </a-row>
              <a-row :gutter="[16, 16]">
                <a-col :span="12">
                  <a-form-item required name="sourceType">
                    <template #label>
                      <label class="flex-center">
                        1688货源
                        <a-tooltip
                          title="1688以图找货源时的规则，如价格最低：则会将价格最低的商品价格作为货源成本价，进行定价"
                        >
                          <QuestionCircleOutlined class="info-icon" />
                        </a-tooltip>
                      </label>
                    </template>
                    <a-radio-group v-model:value="formData.sourceType" style="width: 100%">
                      <a-radio value="0">综合</a-radio>
                      <a-radio value="1">价格最低</a-radio>
                      <a-radio value="2">销量最高</a-radio>
                    </a-radio-group>
                  </a-form-item>
                </a-col>
              </a-row>
            </div>
            <div v-else>
              <a-row :gutter="[16, 16]">
                <a-col :span="8">
                  <a-form-item>
                    <template #label>
                      <label class="flex-center">
                        定价基准
                        <a-tooltip
                          title="以符合条件的商品售价或跟卖最低价为定价基准，配合后面的调整方式和调整值得到最终定价"
                        >
                          <QuestionCircleOutlined class="info-icon" />
                        </a-tooltip>
                      </label>
                    </template>
                    <a-select
                      placeholder="请选择"
                      v-model:value="formData.basePriceType"
                      allowClear
                      :get-popup-container="(triggerNode) => triggerNode.parentNode"
                      @change="changeHandle($event as 'followMin' | 'originSale')"
                    >
                      <a-select-option
                        :value="item.value"
                        v-for="item in priceType"
                        :key="item.value"
                        >{{ item.label }}</a-select-option
                      >
                    </a-select>
                  </a-form-item>
                </a-col>
                <a-col :span="8">
                  <a-form-item>
                    <template #label>
                      <label class="flex-center">
                        调整方式
                        <a-tooltip
                          title="以固定值调整就是比定价基准便宜/贵多少金额，
以百分比调整就是比定价基准便宜/贵百分之多少"
                        >
                          <QuestionCircleOutlined class="info-icon" />
                        </a-tooltip>
                      </label>
                    </template>
                    <a-select
                      placeholder="请选择"
                      v-model:value="formData.rejustType"
                      allowClear
                      :get-popup-container="(triggerNode) => triggerNode.parentNode"
                      @change="formData.rejustValue = undefined"
                      :disabled="!formData.basePriceType"
                    >
                      <a-select-option
                        :value="item.value"
                        v-for="item in regulatingType"
                        :key="item.value"
                        >{{ item.label }}</a-select-option
                      >
                    </a-select>
                  </a-form-item>
                </a-col>
                <a-col :span="8">
                  <a-form-item>
                    <template #label>
                      <label class="flex-center">
                        调整值
                        <a-tooltip
                          title="根据调整值决定比定价基准便宜（用负数-号）/贵（用正数+号）多少（卢布₽ ），
如果出现调整后的价格小于等于0，将按照商品售价或最低跟卖价进行定价"
                        >
                          <QuestionCircleOutlined class="info-icon" />
                        </a-tooltip>
                      </label>
                    </template>
                    <a-input-number
                      v-model:value="formData.rejustValue"
                      placeholder="请输入数值"
                      :disabled="!formData.rejustType"
                      v-if="formData.rejustType === 'fixed'"
                    />
                    <a-input-number
                      v-model:value="formData.rejustValue"
                      placeholder="请输入数值"
                      :disabled="!formData.rejustType"
                      addon-after="%"
                      v-else
                    />
                  </a-form-item>
                </a-col>
              </a-row>
              <a-row :gutter="[16, 16]">
                <a-col :span="8">
                  <a-form-item label="国际物流" name="internalExpress">
                    <a-select
                      placeholder="请选择物流"
                      v-model:value="formData.internalExpress"
                      allowClear
                      :get-popup-container="(triggerNode) => triggerNode.parentNode"
                    >
                      <a-select-option
                        :value="item.value"
                        v-for="item in logisticsSimpleList"
                        :key="item.value"
                      >
                        {{ item.label }}
                      </a-select-option>
                    </a-select>
                  </a-form-item>
                </a-col>
                <a-col :span="8">
                  <a-form-item label="国内运费" name="rubExpressPrice">
                    <a-input-number
                      placeholder="请输入国内运费+代贴单"
                      v-model:value="formData.rubExpressPrice"
                      style="width: 100%"
                      addon-after="￥"
                    />
                  </a-form-item>
                </a-col>
                <a-col :span="8">
                  <a-form-item label="其他（提现、货损等）" name="elsePercent">
                    <a-input-number
                      placeholder="请输入其他费用"
                      v-model:value="formData.elsePercent"
                      style="width: 100%"
                      addon-after="%"
                    />
                  </a-form-item>
                </a-col>
              </a-row>
              <a-row :gutter="[16, 16]">
                <a-col :span="12">
                  <a-form-item required name="sourceType">
                    <template #label>
                      <label class="flex-center">
                        1688货源
                        <a-tooltip
                          title="1688以图找货源时的规则，如价格最低：则会将价格最低的商品价格作为货源成本价，进行定价"
                        >
                          <QuestionCircleOutlined class="info-icon" />
                        </a-tooltip>
                      </label>
                    </template>
                    <a-radio-group v-model:value="formData.sourceType" style="width: 100%">
                      <a-radio value="0">综合</a-radio>
                      <a-radio value="1">价格最低</a-radio>
                      <a-radio value="2">销量最高</a-radio>
                    </a-radio-group>
                  </a-form-item>
                </a-col>
              </a-row>
            </div>
          </section>

          <!-- 选品条件 -->
          <section class="form-section">
            <h3 class="section-title">选品条件</h3>
            <a-row :gutter="[16, 16]">
              <a-col :span="24">
                <a-form-item label="选品方式" required>
                  <a-radio-group v-model:value="formData.aiSelectType" style="width: 100%">
                    <a-radio :value="0"
                      >AI选品
                      <a-tooltip>
                        <template #title>
                          <div v-for="(line, index) in tooltipLines" :key="index">{{ line }}</div>
                        </template>
                        <QuestionCircleOutlined class="info-icon" />
                      </a-tooltip>
                    </a-radio>
                    <a-radio :value="1">自定义</a-radio>
                    <a-radio :value="2"
                      >默认
                      <a-tooltip>
                        <template #title>
                          <div v-for="(line, index) in defaultLines" :key="index">{{ line }}</div>
                        </template>
                        <QuestionCircleOutlined class="info-icon" />
                      </a-tooltip>
                    </a-radio>
                  </a-radio-group>
                </a-form-item>
              </a-col>
            </a-row>
            <div v-if="formData.aiSelectType === 1">
              <a-row :gutter="[16, 16]">
                <a-col :span="12">
                  <a-form-item label="月销量范围">
                    <div class="range-input-wrapper">
                      <a-input-number
                        placeholder="最小值"
                        v-model:value="formData.soldCountMin"
                        style="width: calc(50% - 8px)"
                      />
                      <span class="separator">至</span>
                      <a-input-number
                        placeholder="最大值"
                        v-model:value="formData.soldCountMax"
                        style="width: calc(50% - 8px)"
                      />
                    </div>
                  </a-form-item>
                </a-col>
                <a-col :span="12">
                  <a-form-item label="月销售额范围">
                    <div class="range-input-wrapper">
                      <a-input-number
                        placeholder="最小值"
                        v-model:value="formData.gmvSumMin"
                        style="width: calc(50% - 8px)"
                        addon-before="₽"
                      />
                      <span class="separator">至</span>
                      <a-input-number
                        placeholder="最大值"
                        v-model:value="formData.gmvSumMax"
                        style="width: calc(50% - 8px)"
                        addon-before="₽"
                      />
                    </div>
                  </a-form-item>
                </a-col>
              </a-row>
              <a-row :gutter="[16, 16]">
                <a-col :span="12">
                  <a-form-item>
                    <template #label>
                      <label class="flex-center">
                        商品售价
                        <a-tooltip
                          title="商品售价单位使用的是卢布单位，若您的“ozon前台链接”页面改变了币种，请自行转换。"
                        >
                          <QuestionCircleOutlined class="info-icon" />
                        </a-tooltip>
                      </label>
                    </template>
                    <div class="range-input-wrapper">
                      <a-input-number
                        placeholder="最小价格"
                        v-model:value="formData.salePriceMin"
                        style="width: calc(50% - 8px)"
                        addon-before="₽"
                      />
                      <span class="separator">至</span>
                      <a-input-number
                        placeholder="最大价格"
                        v-model:value="formData.salePriceMax"
                        style="width: calc(50% - 8px)"
                        addon-before="₽"
                      />
                    </div>
                  </a-form-item>
                </a-col>
                <a-col :span="12">
                  <a-form-item label="跟卖人数">
                    <div class="range-input-wrapper">
                      <a-input-number
                        placeholder="最小值"
                        v-model:value="formData.followMin"
                        style="width: calc(50% - 8px)"
                      />
                      <span class="separator">至</span>
                      <a-input-number
                        placeholder="最大值"
                        v-model:value="formData.followMax"
                        style="width: calc(50% - 8px)"
                      />
                    </div>
                  </a-form-item>
                </a-col>
              </a-row>
              <a-row :gutter="[16, 16]">
                <a-col :span="12">
                  <a-form-item label="评分">
                    <div class="range-input-wrapper">
                      <a-input-number placeholder="最小值" v-model:value="formData.ratingMin" />
                      <span class="separator">至</span>
                      <a-input-number placeholder="最大值" v-model:value="formData.ratingMax" />
                    </div>
                  </a-form-item>
                </a-col>
                <a-col :span="12">
                  <a-form-item label="评论数">
                    <div class="range-input-wrapper">
                      <a-input-number
                        placeholder="最小值"
                        v-model:value="formData.numberOfCommentsMin"
                      />
                      <span class="separator">至</span>
                      <a-input-number
                        placeholder="最大值"
                        v-model:value="formData.numberOfCommentsMax"
                      />
                    </div>
                  </a-form-item>
                </a-col>
              </a-row>
              <a-row :gutter="[16, 16]">
                <a-col :span="12">
                  <a-form-item label="点击率">
                    <div class="range-input-wrapper">
                      <a-input-number
                        placeholder="最小值"
                        v-model:value="formData.clickRateMin"
                        style="width: calc(50% - 8px)"
                        addon-after="%"
                      />
                      <span class="separator">至</span>
                      <a-input-number
                        placeholder="最大值"
                        v-model:value="formData.clickRateMax"
                        style="width: calc(50% - 8px)"
                        addon-after="%"
                      />
                    </div>
                  </a-form-item>
                </a-col>
                <a-col :span="12">
                  <a-form-item label="成交率">
                    <div class="range-input-wrapper">
                      <a-input-number
                        placeholder="最小值"
                        v-model:value="formData.nullableRedemptionRateMin"
                        style="width: calc(50% - 8px)"
                        addon-after="%"
                      />
                      <span class="separator">至</span>
                      <a-input-number
                        placeholder="最大值"
                        v-model:value="formData.nullableRedemptionRateMax"
                        style="width: calc(50% - 8px)"
                        addon-after="%"
                      />
                    </div>
                  </a-form-item>
                </a-col>
              </a-row>
              <a-row :gutter="[16, 16]">
                <a-col :span="12">
                  <a-form-item label="上架时间">
                    <div class="range-input-wrapper">
                      <a-input-number
                        placeholder="最小天数"
                        v-model:value="formData.upGoodsTimeMin"
                        style="width: calc(50% - 8px)"
                        addon-after="天"
                      />
                      <span class="separator">至</span>
                      <a-input-number
                        placeholder="最大天数"
                        v-model:value="formData.upGoodsTimeMax"
                        style="width: calc(50% - 8px)"
                        addon-after="天"
                      />
                    </div>
                  </a-form-item>
                </a-col>
                <a-col :span="12">
                  <a-form-item label="月销售动态">
                    <div class="range-input-wrapper">
                      <a-input-number
                        placeholder="最小值"
                        v-model:value="formData.monthDynamicsMin"
                        style="width: calc(50% - 8px)"
                        addon-after="%"
                      />
                      <span class="separator">至</span>
                      <a-input-number
                        placeholder="最大值"
                        v-model:value="formData.monthDynamicsMax"
                        style="width: calc(50% - 8px)"
                        addon-after="%"
                      />
                    </div>
                  </a-form-item>
                </a-col>
              </a-row>
              <a-row :gutter="[16, 16]">
                <a-col :span="12">
                  <a-form-item label="广告份额">
                    <div class="range-input-wrapper">
                      <a-input-number
                        placeholder="最小值"
                        v-model:value="formData.adFeeMin"
                        style="width: calc(50% - 8px)"
                        addon-after="%"
                      />
                      <span class="separator">至</span>
                      <a-input-number
                        placeholder="最大值"
                        v-model:value="formData.adFeeMax"
                        style="width: calc(50% - 8px)"
                        addon-after="%"
                      />
                    </div>
                  </a-form-item>
                </a-col>
                <a-col :span="12">
                  <a-form-item label="参与促销天数">
                    <div class="range-input-wrapper">
                      <a-input-number
                        placeholder="最小天数"
                        v-model:value="formData.promotionDayMin"
                        style="width: calc(50% - 8px)"
                        addon-after="天"
                      />
                      <span class="separator">至</span>
                      <a-input-number
                        placeholder="最大天数"
                        v-model:value="formData.promotionDayMax"
                        style="width: calc(50% - 8px)"
                        addon-after="天"
                      />
                    </div>
                  </a-form-item>
                </a-col>
              </a-row>
              <a-row :gutter="[16, 16]">
                <a-col :span="12">
                  <a-form-item label="参与促销折扣">
                    <div class="range-input-wrapper">
                      <a-input-number
                        placeholder="最小值"
                        v-model:value="formData.promotionDiscountMin"
                        style="width: calc(50% - 8px)"
                        addon-after="%"
                      />
                      <span class="separator">至</span>
                      <a-input-number
                        placeholder="最大值"
                        v-model:value="formData.promotionDiscountMax"
                        style="width: calc(50% - 8px)"
                        addon-after="%"
                      />
                    </div>
                  </a-form-item>
                </a-col>
                <a-col :span="12">
                  <a-form-item label="促销活动的转换率">
                    <div class="range-input-wrapper">
                      <a-input-number
                        placeholder="最小值"
                        v-model:value="formData.promotionDynamicsMin"
                        style="width: calc(50% - 8px)"
                        addon-after="%"
                      />
                      <span class="separator">至</span>
                      <a-input-number
                        placeholder="最大值"
                        v-model:value="formData.promotionDynamicsMax"
                        style="width: calc(50% - 8px)"
                        addon-after="%"
                      />
                    </div>
                  </a-form-item>
                </a-col>
              </a-row>
              <a-row :gutter="[16, 16]">
                <a-col :span="12">
                  <a-form-item label="付费推广天数">
                    <div class="range-input-wrapper">
                      <a-input-number
                        placeholder="最小天数"
                        v-model:value="formData.promoteDayMin"
                        style="width: calc(50% - 8px)"
                        addon-after="天"
                      />
                      <span class="separator">至</span>
                      <a-input-number
                        placeholder="最大天数"
                        v-model:value="formData.promoteDayMax"
                        style="width: calc(50% - 8px)"
                        addon-after="天"
                      />
                    </div>
                  </a-form-item>
                </a-col>
                <a-col :span="12">
                  <a-form-item label="商品卡片浏览量">
                    <div class="range-input-wrapper">
                      <a-input-number
                        placeholder="最小值"
                        v-model:value="formData.viewsMin"
                        style="width: calc(50% - 8px)"
                      />
                      <span class="separator">至</span>
                      <a-input-number
                        placeholder="最大值"
                        v-model:value="formData.viewsMax"
                        style="width: calc(50% - 8px)"
                      />
                    </div>
                  </a-form-item>
                </a-col>
              </a-row>
              <a-row :gutter="[16, 16]">
                <a-col :span="12">
                  <a-form-item label="商品卡片加购率">
                    <div class="range-input-wrapper">
                      <a-input-number
                        placeholder="最小值"
                        v-model:value="formData.cardRateMin"
                        style="width: calc(50% - 8px)"
                        addon-after="%"
                      />
                      <span class="separator">至</span>
                      <a-input-number
                        placeholder="最大值"
                        v-model:value="formData.cardRateMax"
                        style="width: calc(50% - 8px)"
                        addon-after="%"
                      />
                    </div>
                  </a-form-item>
                </a-col>
                <a-col :span="12">
                  <a-form-item label="搜索和目录加购率">
                    <div class="range-input-wrapper">
                      <a-input-number
                        placeholder="最小值"
                        v-model:value="formData.showRateMin"
                        style="width: calc(50% - 8px)"
                        addon-after="%"
                      />
                      <span class="separator">至</span>
                      <a-input-number
                        placeholder="最大值"
                        v-model:value="formData.showRateMax"
                        style="width: calc(50% - 8px)"
                        addon-after="%"
                      />
                    </div>
                  </a-form-item>
                </a-col>
              </a-row>
              <a-row :gutter="[16, 16]">
                <a-col :span="12">
                  <a-form-item label="发货模式">
                    <a-select
                      placeholder="请选择发货模式"
                      v-model:value="formData.salesSchema"
                      style="width: 80%"
                      allowClear
                      :get-popup-container="(triggerNode) => triggerNode.parentNode"
                    >
                      <a-select-option value="FBO">FBO</a-select-option>
                      <a-select-option value="FBS">FBS</a-select-option>
                      <a-select-option value="FBO,FBS">FBO 或 FBS</a-select-option>
                    </a-select>
                  </a-form-item>
                </a-col>
                <a-col :span="12">
                  <a-form-item label="品牌类型">
                    <a-radio-group v-model:value="formData.brandType" style="width: 100%">
                      <a-radio value="0">有品牌</a-radio>
                      <a-radio value="1">无品牌</a-radio>
                      <a-radio value="2">不限</a-radio>
                    </a-radio-group>
                  </a-form-item>
                </a-col>
              </a-row>
            </div>
            <div v-if="formData.aiSelectType === 2">
              <a-row :gutter="[16, 16]">
                <a-col :span="12">
                  <a-form-item label="月销量范围">
                    <div class="range-input-wrapper">
                      <a-input-number
                        placeholder="最小值"
                        v-model:value="formData.soldCountMin"
                        style="width: calc(50% - 8px)"
                        disabled
                      />
                      <span class="separator">至</span>
                      <a-input-number
                        placeholder="最大值"
                        v-model:value="formData.soldCountMax"
                        style="width: calc(50% - 8px)"
                        disabled
                      />
                    </div>
                  </a-form-item>
                </a-col>
                <a-col :span="12">
                  <a-form-item label="月销售动态">
                    <div class="range-input-wrapper">
                      <a-input-number
                        placeholder="最小值"
                        v-model:value="formData.monthDynamicsMin"
                        style="width: calc(50% - 8px)"
                        addon-before="₽"
                        disabled
                      />
                      <span class="separator">至</span>
                      <a-input-number
                        placeholder="最大值"
                        v-model:value="formData.monthDynamicsMax"
                        style="width: calc(50% - 8px)"
                        addon-before="₽"
                        disabled
                      />
                    </div>
                  </a-form-item>
                </a-col>
              </a-row>
              <a-row :gutter="[16, 16]">
                <a-col :span="12">
                  <a-form-item label="跟卖人数">
                    <div class="range-input-wrapper">
                      <a-input-number
                        placeholder="最小值"
                        v-model:value="formData.followMin"
                        style="width: calc(50% - 8px)"
                        disabled
                      />
                      <span class="separator">至</span>
                      <a-input-number
                        placeholder="最大值"
                        v-model:value="formData.followMax"
                        style="width: calc(50% - 8px)"
                        disabled
                      />
                    </div>
                  </a-form-item>
                </a-col>
                <a-col :span="12">
                  <a-form-item label="评分">
                    <div class="range-input-wrapper">
                      <a-input-number
                        placeholder="最小值"
                        v-model:value="formData.ratingMin"
                        disabled
                      />
                      <span class="separator">至</span>
                      <a-input-number
                        placeholder="最大值"
                        v-model:value="formData.ratingMax"
                        disabled
                      />
                    </div>
                  </a-form-item>
                </a-col>
              </a-row>
            </div>
          </section>
        </a-form>
      </div>

      <template #footer>
        <a-button @click="cancelHandle">取消</a-button>
        <a-button type="primary" @click="saveHandle('save')" :loading="submitting">保存</a-button>
        <a-button type="primary" @click="saveHandle('execute')" :loading="submitting"
          >保存并执行</a-button
        >
      </template>
    </a-modal>
  </div>
</template>
<style lang="scss" scoped>
.task-page {
  :deep(.ant-modal-body) {
    padding: 0;
  }
}

.dialog-content {
  max-height: 70vh;
  overflow-y: auto;
}

.form {
  background: white;
  border-radius: 8px;
  padding: 24px;
}

.form-section {
  margin-bottom: 24px;
  padding: 16px;
  background: #fafafa;
  border-radius: 6px;

  &:last-child {
    margin-bottom: 0;
  }
}

.section-title {
  margin: 0 0 16px 0;
  padding: 0;
  font-size: 16px;
  font-weight: 600;
  color: #1d1d1d;
  display: flex;
  align-items: center;
  gap: 8px;
}

.flex-center {
  font-size: 14px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.info-icon {
  color: #ccc;
  cursor: help;
  font-size: 14px;

  &:hover {
    color: #1890ff;
  }
}

.range-input-wrapper {
  display: flex;
  align-items: center;
  width: 82%;

  .separator {
    margin: 0 8px;
    color: rgba(0, 0, 0, 0.65);
    white-space: nowrap;
  }
}

// 表单项样式优化
:deep(.ant-form-item) {
  margin-bottom: 16px;

  .ant-form-item-label {
    padding-bottom: 4px;

    > label {
      font-weight: 500;
      color: #2c2c2c;
      font-size: 14px;

      &::after {
        margin: 0 4px 0 2px;
      }
    }
  }

  .ant-form-item-control {
    line-height: 1.5;
  }
}

// 输入框统一高度
:deep(.ant-input),
:deep(.ant-input-number),
:deep(.ant-select-selector) {
  height: 32px;
  border-radius: 4px;
}

:deep(.ant-input-number) {
  width: 100%;
}

// 响应式
@media (max-width: 768px) {
  .dialog-content {
    padding: 16px;
  }

  .form {
    padding: 16px;
  }

  .form-section {
    padding: 12px;
  }

  :deep(.ant-col) {
    width: 100% !important;
  }
}

.auto-col {
  color: #5a89ff;
  font-size: 14px;
  cursor: pointer;
  margin-top: 2px;
  margin-left: 20px;
}
</style>
