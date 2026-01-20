<script setup lang="ts">
import { QuestionCircleOutlined } from '@ant-design/icons-vue';
import type { FormInstance } from 'ant-design-vue'
import type { Rule } from 'ant-design-vue/es/form';
import type { LogisticsSimpleList, Task } from '@/types/selectGoods';
import feedback from '@/utils/feedback';

defineProps<{
  logisticsSimpleList: LogisticsSimpleList
}>()

const emits = defineEmits(['refresh'])
const open = ref(false)
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
    rubExpressPrice: 0,
    elsePercent: 0,
    sourceType: undefined,
    targetCount: undefined,
    targetProfitPercent: undefined,
    brandType: undefined,
    soldCountMin: 0,
    soldCountMax: 0,
    gmvSumMin: 0,
    gmvSumMax: 0,
    salePriceMin: 0,
    salePriceMax: 0,
    weightMin: 0,
    weightMax: 0,
    upGoodsTimeMin: 0,
    upGoodsTimeMax: 0,
    monthDynamicsMin: 0,
    monthDynamicsMax: 0,
    adFeeMin: 0,
    adFeeMax: 0,
    promotionDayMin: 0,
    promotionDayMax: 0,
    promotionDiscountMin: 0,
    promotionDiscountMax: 0,
    promotionDynamicsMin: 0,
    promotionDynamicsMax: 0,
    promoteDayMin: 0,
    promoteDayMax: 0,
    viewsMin: 0,
    viewsMax: 0,
    cardRateMin: 0,
    cardRateMax: 0,
    showRateMin: 0,
    showRateMax: 0,
    salesSchema: undefined,
    followMin: 0,
    followMax: 0,
    token: ''
  }
)
const formData = ref<Task>({ ...initData.value })
const rules: Record<string, Rule[]> = {
  taskName: [{ required: true, message: '请输入任务名称', trigger: ['change', 'blur'] }],
  targetUrl: [{ required: true, message: '请输入网址', trigger: ['change', 'blur'] }],
  sourceType: [{ required: true, message: '请选择货源排序', trigger: ['change', 'blur'] }],
  targetCount: [{ required: true, message: '请输入目标数量', trigger: ['change', 'blur'] }],
  targetProfitPercent: [{ required: true, message: '请输入利润率大于', trigger: ['change', 'blur'] }]
}
const openDialog = () => open.value = true

// 创建采集任务
const formRef = ref<FormInstance>()
const cancelHandle = () => {
  open.value = false
  formRef.value?.resetFields()
}

const saveHandle = async (type: 'save' | 'execute') => {
  await formRef.value?.validate()
  const { code, message } = type === 'execute' ? await window.electronAPI.invoke('collection-create-and-start', { data: toRaw(formData.value), type }) : await window.electronAPI.invoke('collection-create', { data: toRaw(formData.value), type })

  if (code === 200) {
    emits('refresh')
    feedback.success('操作成功')
    cancelHandle()
    return
  }
  feedback.error(message)
}

defineExpose({
  formData,
  openDialog
})
</script>

<template>
  <div class="task-page">
    <a-modal v-model:open="open" :title="formData._id ? '编辑任务' : '新增任务'" style="width: 1000px;" @close="cancelHandle">
      <a-form :model="formData" layout="horizontal" :label-col="{ span: 8 }" :wrapper-col="{ span: 24 }"
        style="padding:0 60px;" :rules="rules" ref="formRef">
        <a-row class="bold">基础信息</a-row>
        <a-row>
          <a-col :span="12">
            <a-form-item required label="任务名称" name="taskName">
              <a-input placeholder="请输入任务名称" v-model:value="formData.taskName" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item required name="targetUrl">
              <template #label>
                爬取网站URL
                <a-tooltip>
                  <QuestionCircleOutlined />
                  <template #title>支持OZON商城的列表页，如：类目链接、店铺链接、搜索结果页链接</template>
                </a-tooltip>
              </template>
              <a-input placeholder="请输入任务名称" v-model:value="formData.targetUrl" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row class="bold">
          商品定价
          <a-tooltip>
            <QuestionCircleOutlined />
            <template #title>对符合条件的商品，进行定价</template>
          </a-tooltip>
        </a-row>
        <a-row>
          <a-col :span="12">
            <a-form-item label="我的利润率" name="myProfitPercent">
              <a-input placeholder="请输入利润率" v-model:value="formData.myProfitPercent" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="国际物流" name="internalExpress">
              <a-select placeholder="请选择物流" v-model:value="formData.internalExpress">
                <a-select-option :value="item.value" v-for="item in logisticsSimpleList">{{ item.label
                }}</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
        </a-row>
        <a-row>
          <a-col :span="12">
            <a-form-item label="国内运费" name="rubExpressPrice">
              <a-input placeholder="请输入国内运费+代贴单" v-model:value="formData.rubExpressPrice" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="其他（提现、货损等）" name="elsePercent">
              <a-input placeholder="请输入其他费用" v-model:value="formData.elsePercent" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row>
          <a-col :span="12">
            <a-form-item required name="sourceType">
              <template #label>
                1688货源
                <a-tooltip>
                  <QuestionCircleOutlined />
                  <template #title>1688以图找货源时的规则，如价格最低：则会将价格最低的商品价格作为货源成本价，进行定价</template>
                </a-tooltip>
              </template>
              <a-radio-group v-model:value="formData.sourceType">
                <a-radio value="1">价格最低</a-radio>
                <a-radio value="2">销量最高</a-radio>
              </a-radio-group>
            </a-form-item>
          </a-col>
        </a-row>
        <a-row>
          选品条件
        </a-row>
        <a-row>
          <a-col :span="12">
            <a-form-item required name="targetCount">
              <template #label>
                目标数量
                <a-tooltip>
                  <QuestionCircleOutlined />
                  <template #title>执行任务需要导出的商品数量，数量越大，则耗时越长。若长时间未能找到符合条件的商品，任务可能自动结束，导出的商品数量可能小于该值。</template>
                </a-tooltip>
              </template>
              <a-input placeholder="请输入目标数量" v-model:value="formData.targetCount" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item required name="targetProfitPercent">
              <template #label>
                利润率大于
                <a-tooltip>
                  <QuestionCircleOutlined />
                  <template #title>利润率计算公式：（1-（货源陈本+国内运费+其他费用+国际物流费+平台佣金+平台配送费）/ 当前售价）*
                    100%。注意，部分商品的平台佣金、国际物流费用等费用，无法正常获取时，将按0元计算</template>
                </a-tooltip>
              </template>
              <a-input placeholder="请输入利润率" v-model:value="formData.targetProfitPercent" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row>
          <a-col :span="12">
            <a-form-item label="品牌类型">
              <a-radio-group v-model:value="formData.brandType">
                <a-radio value="0">有品牌</a-radio>
                <a-radio value="1">无品牌</a-radio>
                <a-radio value="2">不限</a-radio>
              </a-radio-group>
            </a-form-item>
          </a-col>
        </a-row>
        <a-row>
          <a-col :span="12">
            <a-form-item label="月销量范围">
              <a-input placeholder="最小值" style="width:110px"
                v-model:value="formData.soldCountMin" /><span>至</span><a-input placeholder="最大值" style="width:110px"
                v-model:value="formData.soldCountMax" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row>
          <a-col :span="12">
            <a-form-item label="月销售额范围">
              <a-input placeholder="最小值" addon-before="₽" style="width:110px"
                v-model:value="formData.gmvSumMin" /><span>至</span><a-input placeholder="最大值" addon-before="₽"
                style="width:110px" v-model:value="formData.gmvSumMax" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row>
          <a-col :span="12">
            <a-form-item label="商品售价">
              <a-input placeholder="最小价格" addon-before="₽" style="width:110px"
                v-model:value="formData.salePriceMin" /><span>至</span>
              <a-input placeholder="最大价格" addon-before="₽" style="width:110px" v-model:value="formData.salePriceMax" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row>
          <a-col :span="12">
            <a-form-item label="重量范围">
              <a-input placeholder="最小重量" addon-after="g" style="width:110px"
                v-model:value="formData.weightMin" /><span>至</span><a-input placeholder="最大重量" addon-after="g"
                style="width:110px" v-model:value="formData.weightMax" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row>
          <a-col :span="12">
            <a-form-item label="上架时间">
              <a-input placeholder="最小天数" addon-after="天" style="width:110px"
                v-model:value="formData.upGoodsTimeMin" /><span>至</span><a-input placeholder="最大天数" addon-after="天"
                style="width:110px" v-model:value="formData.upGoodsTimeMax" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row>
          <a-col :span="12">
            <a-form-item label="月销售动态">
              <a-input placeholder="最小值" addon-after="%" style="width:110px"
                v-model:value="formData.monthDynamicsMin" /><span>至</span><a-input placeholder="最大值" addon-after="%"
                style="width:110px" v-model:value="formData.monthDynamicsMax" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row>
          <a-col :span="12">
            <a-form-item label="广告份额">
              <a-input placeholder="最小值" addon-after="%" style="width:110px"
                v-model:value="formData.adFeeMin" /><span>至</span><a-input placeholder="最大值" addon-after="%"
                style="width:110px" v-model:value="formData.adFeeMax" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row>
          <a-col :span="12">
            <a-form-item label="参与促销天数">
              <a-input placeholder="最小天数" addon-after="天" style="width:110px"
                v-model:value="formData.promotionDayMin" /><span>至</span><a-input placeholder="最大天数" addon-after="天"
                style="width:110px" v-model:value="formData.promotionDayMax" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row>
          <a-col :span="12">
            <a-form-item label="参与促销折扣">
              <a-input placeholder="最小值" addon-after="%" style="width:110px"
                v-model:value="formData.promotionDiscountMin" /><span>至</span><a-input placeholder="最大值" addon-after="%"
                style="width:110px" v-model:value="formData.promotionDiscountMax" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row>
          <a-col :span="12">
            <a-form-item label="促销活动的转换率">
              <a-input placeholder="最小值" addon-after="%" style="width:110px"
                v-model:value="formData.promotionDynamicsMin" /><span>至</span><a-input placeholder="最大值" addon-after="%"
                style="width:110px" v-model:value="formData.promotionDynamicsMax" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row>
          <a-col :span="12">
            <a-form-item label="付费推广天数">
              <a-input placeholder="最小天数" addon-after="天" style="width:110px"
                v-model:value="formData.promoteDayMin" /><span>至</span><a-input placeholder="最大天数" addon-after="天"
                style="width:110px" v-model:value="formData.promoteDayMax" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row>
          <a-col :span="12">
            <a-form-item label="商品卡片浏览量">
              <a-input placeholder="最小值" style="width:110px" v-model:value="formData.viewsMin" /><span>至</span><a-input
                placeholder="最大值" style="width:110px" v-model:value="formData.viewsMax" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row>
          <a-col :span="12">
            <a-form-item label="商品卡片加购率">
              <a-input placeholder="最小值" addon-after="%" style="width:110px"
                v-model:value="formData.cardRateMin" /><span>至</span><a-input placeholder="最大值" addon-after="%"
                style="width:110px" v-model:value="formData.cardRateMax" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row>
          <a-col :span="12">
            <a-form-item label="搜索和目录加购率">
              <a-input placeholder="最小值" addon-after="%" style="width:110px" v-model:value="formData.showRateMin" />
              <span>至</span>
              <a-input placeholder="最大值" addon-after="%" style="width:110px" v-model:value="formData.showRateMax" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row>
          <a-col :span="12">
            <a-form-item label="发货模式">
              <a-select placeholder="请选择发货模式" v-model:value="formData.salesSchema">
                <a-select-option value="FBO">FBO</a-select-option>
                <a-select-option value="FBS">FBS</a-select-option>
                <a-select-option value="FBO,FBS">FBO & FBS</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
        </a-row>
        <a-row>
          <a-col :span="12">
            <a-form-item label="跟卖人数">
              <a-input placeholder="最小值" style="width:110px" v-model:value="formData.followMin" /><span>至</span><a-input
                placeholder="最大值" style="width:110px" v-model:value="formData.followMax" />
            </a-form-item>
          </a-col>
        </a-row>
      </a-form>
      <template #footer>
        <a-button @click="cancelHandle">取消</a-button>
        <a-button style="margin: 0 10px;" type="primary" @click="saveHandle('save')">保存</a-button>
        <a-button type="primary" @click="saveHandle('execute')">保存并执行</a-button>
      </template>
    </a-modal>
  </div>
</template>

<style lang="scss" scoped>
.bold {
  align-items: center;
}

span {
  margin: 0 1px;
  white-space: nowrap; // 防止文字换行
  line-height: 32px; // 匹配输入框的高度
}
</style>
