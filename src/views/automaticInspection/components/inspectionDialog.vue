<script setup lang="ts">
import type { Response } from '@/types'
import type { TaskParams } from '@/types/inspection'
import feedback from '@/utils/feedback'
import type { FormInstance } from 'ant-design-vue'
import type { Rule } from 'ant-design-vue/es/form'
const open = ref(false)
const emit = defineEmits(['refresh'])
const initFormData = ref<TaskParams>({
  shopName: '',
  shopUrl: '',
  taskStatus: 'noExecuted',
  executionMethod: 'MANUAL',
  autoExecutionTime: undefined,
})
const rules: Record<string, Rule[]> = {
  shopName: [{ required: true, message: '请输入店铺名称', trigger: 'blur' }],
  shopUrl: [{ required: true, message: '请输入店铺链接', trigger: 'blur' }],
  executionMethod: [{ required: true, message: '请选择执行方式', trigger: 'change' }],
}
const formData = ref<TaskParams>({ ...initFormData.value })
const hours = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`)
const formRef = ref<FormInstance>()
// 切换执行方式
const handleExecMethodChange = () => {
  formData.value.autoExecutionTime = undefined
}
// 创建任务
const handleOk = async () => {
  await formRef.value?.validate()
  if (formData.value.executionMethod === 'AUTO' && !formData.value.autoExecutionTime)
    return feedback.warning('请选择执行时间')
  const params = toRaw(formData.value)
  const { data, code, message } = formData.value.taskId
    ? await window.electronAPI.invoke<Response<{ taskId: string }>>(
        'inspection-update-task',
        params,
      )
    : await window.electronAPI.invoke<Response<{ taskId: string }>>(
        'inspection-create-task',
        params,
      )
  if (!code) {
    open.value = false
    emit('refresh')
    feedback.success('创建任务成功')
    return
  }
  feedback.error(message || '系统繁忙')
}
// 重置表单数据
const handleCancel = () => {
  formData.value = { ...initFormData.value }
  formRef.value?.resetFields()
}
defineExpose({
  open,
  formData,
})
</script>

<template>
  <a-modal
    v-model:open="open"
    title="新增巡查任务"
    width="50vw"
    :footer="null"
    @ok="handleOk"
    @cancel="handleCancel"
  >
    <div class="dialog-content">
      <a-form
        ref="formRef"
        :model="formData"
        :rules="rules"
        layout="vertical"
        :label-col="{ span: 24 }"
        :wrapper-col="{ span: 24 }"
      >
        <!-- 店铺名称 -->
        <a-form-item label="店铺名称" :required="true" name="shopName">
          <a-input
            v-model:value="formData.shopName"
            placeholder="请输入店铺名称"
            :maxlength="50"
            style="width: 100%"
          />
        </a-form-item>

        <!-- 店铺链接 -->
        <a-form-item label="店铺链接" :required="true" name="shopUrl">
          <a-input
            v-model:value="formData.shopUrl"
            placeholder="请输入店铺链接（例如：https://www.ozon.ru/seller/{店铺id}）"
            :maxlength="200"
            style="width: 100%"
          />
        </a-form-item>

        <!-- 执行方式 -->
        <a-form-item label="执行方式" :required="true">
          <a-radio-group v-model:value="formData.executionMethod" @change="handleExecMethodChange">
            <a-radio value="MANUAL">手动执行</a-radio>
            <a-radio value="AUTO">自动执行</a-radio>
          </a-radio-group>
        </a-form-item>
        <!-- 自动执行时间选择 -->
        <a-form-item v-if="formData.executionMethod === 'AUTO'" class="auto-time-select">
          <div class="time-grid">
            <div v-for="hour in hours" :key="hour" class="time-item">
              <a-radio-group v-model:value="formData.autoExecutionTime">
                <a-radio :value="hour">
                  {{ hour }}
                </a-radio>
              </a-radio-group>
            </div>
          </div>
        </a-form-item>
      </a-form>
    </div>

    <!-- 模态框底部按钮 -->
    <div class="dialog-footer">
      <a-button type="default" @click="handleCancel">取消</a-button>
      <a-button type="primary" @click="handleOk">确认</a-button>
    </div>
  </a-modal>
</template>

<style scoped lang="scss">
.dialog-content {
  padding: 20px;
  background-color: #fff;
  border-radius: 8px;

  .ant-form-item {
    margin-bottom: 16px;
  }

  .ant-input {
    border-radius: 4px;
  }

  .auto-time-select {
    padding: 10px;
    margin-top: 16px;
    border-radius: 5px;
    border: 1px solid #d9d9d9;
    .time-grid {
      display: grid;
      grid-template-columns: repeat(6, 1fr);
      gap: 8px;

      .time-item {
        text-align: center;

        .ant-radio {
          margin-bottom: 8px;
        }

        .ant-radio + span {
          font-size: 12px;
          color: #000;
        }
      }
    }
  }
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 16px;
  padding: 20px 20px 16px;

  .ant-btn {
    border-radius: 4px;
  }

  .ant-btn-primary {
    background-color: #1890ff;
    border-color: #1890ff;
  }
}
</style>
