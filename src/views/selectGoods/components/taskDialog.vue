<template>
  <div class="task-page">
    <a-modal v-model:open="open" :title="formData._id ? '编辑任务' : '新增任务'" @cancel="cancelHandle" width="900px"
      destroy-on-close :maskClosable="false">
      <div class="dialog-content">
        <a-form :model="formData" layout="vertical" :label-col="{ span: 24 }" :wrapper-col="{ span: 24 }" :rules="rules"
          ref="formRef" class="form">
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
                <a-form-item required name="targetUrl">
                  <template #label>
                    <label class="flex-center">
                      爬取网站URL
                      <a-tooltip title="支持OZON商城的列表页，如：类目链接、店铺链接、搜索结果页链接">
                        <QuestionCircleOutlined class="info-icon" />
                      </a-tooltip>
                    </label>
                  </template>
                  <a-input placeholder="请输入URL" v-model:value="formData.targetUrl" />
                </a-form-item>
              </a-col>
            </a-row>
          </section>

          <!-- 商品定价 -->
          <section class="form-section">
            <h3 class="section-title">
              <span>商品定价</span>
              <a-tooltip title="对符合条件的商品，进行定价">
                <QuestionCircleOutlined class="info-icon" />
              </a-tooltip>
            </h3>
            <a-row :gutter="[16, 16]">
              <a-col :span="12">
                <a-form-item label="我的利润率" name="myProfitPercent">
                  <a-input-number placeholder="请输入利润率" v-model:value="formData.myProfitPercent" style="width: 100%"
                    :precision="2" addon-after="%" />
                </a-form-item>
              </a-col>
              <a-col :span="12">
                <a-form-item label="国际物流" name="internalExpress">
                  <a-select placeholder="请选择物流" v-model:value="formData.internalExpress" allowClear>
                    <a-select-option :value="item.value" v-for="item in logisticsSimpleList" :key="item.value">
                      {{ item.label }}
                    </a-select-option>
                  </a-select>
                </a-form-item>
              </a-col>
            </a-row>
            <a-row :gutter="[16, 16]">
              <a-col :span="12">
                <a-form-item label="国内运费" name="rubExpressPrice">
                  <a-input-number placeholder="请输入国内运费+代贴单" v-model:value="formData.rubExpressPrice" style="width: 100%"
                    :precision="2" addon-after="₽" />
                </a-form-item>
              </a-col>
              <a-col :span="12">
                <a-form-item label="其他（提现、货损等）" name="elsePercent">
                  <a-input-number placeholder="请输入其他费用" v-model:value="formData.elsePercent" style="width: 100%"
                    :precision="2" addon-after="%" />
                </a-form-item>
              </a-col>
            </a-row>
            <a-row :gutter="[16, 16]">
              <a-col :span="12">
                <a-form-item required name="sourceType">
                  <template #label>
                    <label class="flex-center">
                      1688货源
                      <a-tooltip title="1688以图找货源时的规则，如价格最低：则会将价格最低的商品价格作为货源成本价，进行定价">
                        <QuestionCircleOutlined class="info-icon" />
                      </a-tooltip>
                    </label>
                  </template>
                  <a-radio-group v-model:value="formData.sourceType" style="width: 100%">
                    <a-radio value="0">默认</a-radio>
                    <a-radio value="1">价格最低</a-radio>
                    <a-radio value="2">销量最高</a-radio>
                  </a-radio-group>
                </a-form-item>
              </a-col>
            </a-row>
          </section>

          <!-- 选品条件 -->
          <section class="form-section">
            <h3 class="section-title">选品条件</h3>
            <a-row :gutter="[16, 16]">
              <a-col :span="12">
                <a-form-item required name="targetCount">
                  <template #label>
                    <label class="flex-center">
                      目标数量
                      <a-tooltip title="执行任务需要导出的商品数量，数量越大，则耗时越长。若长时间未能找到符合条件的商品，任务可能自动结束，导出的商品数量可能小于该值。">
                        <QuestionCircleOutlined class="info-icon" />
                      </a-tooltip>
                    </label>
                  </template>
                  <a-input-number placeholder="请输入目标数量" v-model:value="formData.targetCount" style="width: 100%"
                    :min="1" />
                </a-form-item>
              </a-col>
              <!--              <a-col :span="12">
                <a-form-item required name="targetProfitPercent">
                  <template #label>
                    <label class="flex-center">
                      利润率大于
                      <a-tooltip
                        title="利润率计算公式：（1-（货源成本+国内运费+其他费用+国际物流费+平台佣金+平台配送费）/ 当前售价）* 100%。注意，部分商品的平台佣金、国际物流费用等费用，无法正常获取时，将按0元计算">
                        <QuestionCircleOutlined class="info-icon" />
                      </a-tooltip>
                    </label>
                  </template>
                  <a-input-number placeholder="请输入利润率" v-model:value="formData.targetProfitPercent" style="width: 100%"
                    :precision="2" />
                </a-form-item>
              </a-col> -->
            </a-row>
            <a-row :gutter="[16, 16]">
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
          </section>

          <!-- 范围输入组 -->
          <section class="form-section">
            <h3 class="section-title">商品筛选条件</h3>
            <a-row :gutter="[16, 16]">
              <a-col :span="12">
                <a-form-item label="月销量范围">
                  <div class="range-input-wrapper">
                    <a-input-number placeholder="最小值" v-model:value="formData.soldCountMin"
                      style="width: calc(50% - 8px)" :precision="2" />
                    <span class="separator">至</span>
                    <a-input-number placeholder="最大值" v-model:value="formData.soldCountMax"
                      style="width: calc(50% - 8px)" :precision="2" />
                  </div>
                </a-form-item>
              </a-col>
              <a-col :span="12">
                <a-form-item label="月销售额范围">
                  <div class="range-input-wrapper">
                    <a-input-number placeholder="最小值" v-model:value="formData.gmvSumMin" style="width: calc(50% - 8px)"
                      :precision="2" addon-before="₽" />
                    <span class="separator">至</span>
                    <a-input-number placeholder="最大值" v-model:value="formData.gmvSumMax" style="width: calc(50% - 8px)"
                      :precision="2" addon-before="₽" />
                  </div>
                </a-form-item>
              </a-col>
            </a-row>
            <a-row :gutter="[16, 16]">
              <a-col :span="12">
                <a-form-item label="商品售价">
                  <div class="range-input-wrapper">
                    <a-input-number placeholder="最小价格" v-model:value="formData.salePriceMin"
                      style="width: calc(50% - 8px)" :precision="2" addon-before="₽" />
                    <span class="separator">至</span>
                    <a-input-number placeholder="最大价格" v-model:value="formData.salePriceMax"
                      style="width: calc(50% - 8px)" :precision="2" addon-before="₽" />
                  </div>
                </a-form-item>
              </a-col>
              <a-col :span="12">
                <a-form-item label="重量范围">
                  <div class="range-input-wrapper">
                    <a-input-number placeholder="最小重量" v-model:value="formData.weightMin" style="width: calc(50% - 8px)"
                      :precision="2" addon-after="g" />
                    <span class="separator">至</span>
                    <a-input-number placeholder="最大重量" v-model:value="formData.weightMax" style="width: calc(50% - 8px)"
                      :precision="2" addon-after="g" />
                  </div>
                </a-form-item>
              </a-col>
            </a-row>
            <a-row :gutter="[16, 16]">
              <a-col :span="12">
                <a-form-item label="上架时间">
                  <div class="range-input-wrapper">
                    <a-input-number placeholder="最小天数" v-model:value="formData.upGoodsTimeMin"
                      style="width: calc(50% - 8px)" :precision="2" addon-after="天" />
                    <span class="separator">至</span>
                    <a-input-number placeholder="最大天数" v-model:value="formData.upGoodsTimeMax"
                      style="width: calc(50% - 8px)" :precision="2" addon-after="天" />
                  </div>
                </a-form-item>
              </a-col>
              <a-col :span="12">
                <a-form-item label="月销售动态">
                  <div class="range-input-wrapper">
                    <a-input-number placeholder="最小值" v-model:value="formData.monthDynamicsMin"
                      style="width: calc(50% - 8px)" :precision="2" addon-after="%" />
                    <span class="separator">至</span>
                    <a-input-number placeholder="最大值" v-model:value="formData.monthDynamicsMax"
                      style="width: calc(50% - 8px)" :precision="2" addon-after="%" />
                  </div>
                </a-form-item>
              </a-col>
            </a-row>
            <a-row :gutter="[16, 16]">
              <a-col :span="12">
                <a-form-item label="广告份额">
                  <div class="range-input-wrapper">
                    <a-input-number placeholder="最小值" v-model:value="formData.adFeeMin" style="width: calc(50% - 8px)"
                      :precision="2" addon-after="%" />
                    <span class="separator">至</span>
                    <a-input-number placeholder="最大值" v-model:value="formData.adFeeMax" style="width: calc(50% - 8px)"
                      :precision="2" addon-after="%" />
                  </div>
                </a-form-item>
              </a-col>
              <a-col :span="12">
                <a-form-item label="参与促销天数">
                  <div class="range-input-wrapper">
                    <a-input-number placeholder="最小天数" v-model:value="formData.promotionDayMin"
                      style="width: calc(50% - 8px)" :precision="2" addon-after="天" />
                    <span class="separator">至</span>
                    <a-input-number placeholder="最大天数" v-model:value="formData.promotionDayMax"
                      style="width: calc(50% - 8px)" :precision="2" addon-after="天" />
                  </div>
                </a-form-item>
              </a-col>
            </a-row>
            <a-row :gutter="[16, 16]">
              <a-col :span="12">
                <a-form-item label="参与促销折扣">
                  <div class="range-input-wrapper">
                    <a-input-number placeholder="最小值" v-model:value="formData.promotionDiscountMin"
                      style="width: calc(50% - 8px)" :precision="2" addon-after="%" />
                    <span class="separator">至</span>
                    <a-input-number placeholder="最大值" v-model:value="formData.promotionDiscountMax"
                      style="width: calc(50% - 8px)" :precision="2" addon-after="%" />
                  </div>
                </a-form-item>
              </a-col>
              <a-col :span="12">
                <a-form-item label="促销活动的转换率">
                  <div class="range-input-wrapper">
                    <a-input-number placeholder="最小值" v-model:value="formData.promotionDynamicsMin"
                      style="width: calc(50% - 8px)" :precision="2" addon-after="%" />
                    <span class="separator">至</span>
                    <a-input-number placeholder="最大值" v-model:value="formData.promotionDynamicsMax"
                      style="width: calc(50% - 8px)" :precision="2" addon-after="%" />
                  </div>
                </a-form-item>
              </a-col>
            </a-row>
            <a-row :gutter="[16, 16]">
              <a-col :span="12">
                <a-form-item label="付费推广天数">
                  <div class="range-input-wrapper">
                    <a-input-number placeholder="最小天数" v-model:value="formData.promoteDayMin"
                      style="width: calc(50% - 8px)" :precision="2" addon-after="天" />
                    <span class="separator">至</span>
                    <a-input-number placeholder="最大天数" v-model:value="formData.promoteDayMax"
                      style="width: calc(50% - 8px)" :precision="2" addon-after="天" />
                  </div>
                </a-form-item>
              </a-col>
              <a-col :span="12">
                <a-form-item label="商品卡片浏览量">
                  <div class="range-input-wrapper">
                    <a-input-number placeholder="最小值" v-model:value="formData.viewsMin" style="width: calc(50% - 8px)"
                      :precision="2" />
                    <span class="separator">至</span>
                    <a-input-number placeholder="最大值" v-model:value="formData.viewsMax" style="width: calc(50% - 8px)"
                      :precision="2" />
                  </div>
                </a-form-item>
              </a-col>
            </a-row>
            <a-row :gutter="[16, 16]">
              <a-col :span="12">
                <a-form-item label="商品卡片加购率">
                  <div class="range-input-wrapper">
                    <a-input-number placeholder="最小值" v-model:value="formData.cardRateMin"
                      style="width: calc(50% - 8px)" :precision="2" addon-after="%" />
                    <span class="separator">至</span>
                    <a-input-number placeholder="最大值" v-model:value="formData.cardRateMax"
                      style="width: calc(50% - 8px)" :precision="2" addon-after="%" />
                  </div>
                </a-form-item>
              </a-col>
              <a-col :span="12">
                <a-form-item label="搜索和目录加购率">
                  <div class="range-input-wrapper">
                    <a-input-number placeholder="最小值" v-model:value="formData.showRateMin"
                      style="width: calc(50% - 8px)" :precision="2" addon-after="%" />
                    <span class="separator">至</span>
                    <a-input-number placeholder="最大值" v-model:value="formData.showRateMax"
                      style="width: calc(50% - 8px)" :precision="2" addon-after="%" />
                  </div>
                </a-form-item>
              </a-col>
            </a-row>
            <a-row :gutter="[16, 16]">
              <a-col :span="12">
                <a-form-item label="发货模式">
                  <a-select placeholder="请选择发货模式" v-model:value="formData.salesSchema" style="width: 80%;" allowClear>
                    <a-select-option value="FBO">FBO</a-select-option>
                    <a-select-option value="FBS">FBS</a-select-option>
                    <a-select-option value="FBO,FBS">FBO | FBS</a-select-option>
                  </a-select>
                </a-form-item>
              </a-col>
              <a-col :span="12">
                <a-form-item label="跟卖人数">
                  <div class="range-input-wrapper">
                    <a-input-number placeholder="最小值" v-model:value="formData.followMin"
                      style="width: calc(50% - 8px)" />
                    <span class="separator">至</span>
                    <a-input-number placeholder="最大值" v-model:value="formData.followMax"
                      style="width: calc(50% - 8px)" />
                  </div>
                </a-form-item>
              </a-col>
            </a-row>
          </section>
        </a-form>
      </div>

      <template #footer>
        <a-button @click="cancelHandle">取消</a-button>
        <a-button type="primary" @click="saveHandle('save')">保存</a-button>
        <a-button type="primary" @click="saveHandle('execute')" :loading="submitting">保存并执行</a-button>
      </template>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { QuestionCircleOutlined } from '@ant-design/icons-vue';
import type { FormInstance } from 'ant-design-vue';
import type { Rule } from 'ant-design-vue/es/form';
import type { LogisticsSimpleList, Task } from '@/types/selectGoods';
import feedback from '@/utils/feedback';

defineProps<{
  logisticsSimpleList: LogisticsSimpleList
}>()

const emits = defineEmits(['refresh'])
const open = ref(false)
const submitting = ref(false)

const initData = ref<Task>(
  {
    _id: undefined,
    taskStatus: 'noExecuted',
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
    salesSchema: 'FBO',
    followMin: undefined,
    followMax: undefined,
    token: ''
  }
)

const formData = ref<Task>({ ...initData.value })

const rules: Record<string, Rule[]> = {
  taskName: [{ required: true, message: '请输入任务名称', trigger: ['change', 'blur'] }],
  targetUrl: [{ required: true, message: '请输入网址', trigger: ['change', 'blur'] }],
  sourceType: [{ required: true, message: '请选择货源排序', trigger: ['change', 'blur'] }],
  targetCount: [
    { required: true, message: '请输入目标数量', trigger: ['change', 'blur'] },
    {
      validator: (_, value) => {
        if (value <= 0) {
          return Promise.reject('请输入大于0的数字');
        }
        return Promise.resolve();
      },
      trigger: ['change', 'blur']
    }
  ],
  // targetProfitPercent: [{ required: true, message: '请输入利润率大于', trigger: ['change', 'blur'] }]
}

const openDialog = () => open.value = true

// 创建采集任务
const formRef = ref<FormInstance>()

const cancelHandle = () => {
  open.value = false
  formData.value = { ...initData.value }
  formRef.value?.resetFields()
}

const saveHandle = async (type: 'save' | 'execute') => {
  try {
    await formRef.value?.validate()
  } catch (error) {
    feedback.error('请完善表单报错项')
    return
  }

  if (+(formData.value.myProfitPercent || 0) + +(formData.value.elsePercent || 0) > 100) {
    return feedback.error('利润率与其他费用加起来不能大于100%')
  }

  submitting.value = true

  try {
    const data = toRaw(formData.value)
    if (data.progress) data.progress = toRaw(data.progress)

    const { code, message } = type === 'execute'
      ? await window.electronAPI.invoke('collection-create-and-start', { data, type })
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

defineExpose({
  formData,
  openDialog
})
</script>

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

    >label {
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
    width: 100%;
  }
}
</style>