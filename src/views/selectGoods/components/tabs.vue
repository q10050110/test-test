<script setup lang="ts">
import type { Task } from '@/types/selectGoods';
import { DesktopOutlined } from '@ant-design/icons-vue';
// 标签页
const activeKey = ref()
const taskStackList = ref<Task[]>([])

// 获取任务栈列表
const getTaskStackList = (task?: Task) => {
  if (!task) return
  if (task.status === 'running') {
    if (!taskStackList.value.map(item => item.id).includes(task.id)) {
      taskStackList.value.unshift(task)
      activeKey.value = task.id!
    }
  } else {
    taskStackList.value = taskStackList.value.filter(task => task.id !== task.id)
  }
}

onMounted(() => {
  window.electronAPI.on('task-status-update', getTaskStackList)
})

onUnmounted(() => {
  window.electronAPI.off('task-status-update', getTaskStackList)
})

// 写入日志内容
const writeLog = (taskId: string, data: { log: string, date: string }) => {
  const obj = taskStackList.value.find(item => item.id === taskId)
  if (obj) {
    if (!obj.log) obj.log = []
    obj.log.push(data)
  }
}

defineExpose({
  writeLog
})
</script>

<template>
  <a-tabs v-model:activeKey="activeKey" v-if="taskStackList.length">
    <a-tab-pane :key="item.id" :tab="item.taskName" v-for="(item, i) in taskStackList">
      <div v-for="(log, i) in item.log" :key="i">
        {{ log.date }}
        <DesktopOutlined />
        {{ log.log }}
      </div>
    </a-tab-pane>
  </a-tabs>
  <div v-else>
    当前没有在执行的任务
  </div>
</template>

<style lang="scss" scoped>
:deep(.ant-tabs-content-holder) {
  height: 120px;
  overflow-y: auto;
}
</style>
