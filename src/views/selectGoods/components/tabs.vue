<script setup lang="ts">
import type { Task, TaskStatus } from '@/types/selectGoods';
import { DesktopOutlined } from '@ant-design/icons-vue';
// 标签页
const activeKey = ref()
const taskStackList = ref<Task[]>([])
const logRefs = ref<Record<string, HTMLElement>>({})
const setLogRef = (el: HTMLElement | null, taskId: string) => {
  if (el) {
    logRefs.value[taskId] = el
  }
}
// 自动滚动到底部
const scrollToBottom = async (taskId: string) => {
  await nextTick()
  const logContainer = logRefs.value[taskId]
  if (logContainer) {
    logContainer.scrollTo({
      top: logContainer.scrollHeight,
      behavior: 'smooth'
    })
  }
}
// 获取任务栈列表
const getTaskStackList = (data?: any) => {
  const { task, status } = data
  if (!task || !status) return

  if (status === 'running') {
    if (!taskStackList.value.map(item => item._id).includes(task._id)) {
      taskStackList.value.unshift(task)
      activeKey.value = task._id
    }
  } else {
    taskStackList.value = taskStackList.value.filter(item => item._id !== task._id)
  }
}

onMounted(() => {
  window.electronAPI.on('task-status-update', getTaskStackList)
})

onUnmounted(() => {
  window.electronAPI.off('task-status-update', getTaskStackList)
})

// 写入日志内容
const writeLog = (taskId: string, data: { taskLog: string, date: string }) => {
  const obj = taskStackList.value.find(item => item._id === taskId)
  if (obj) {
    if (!obj.log) obj.log = []
    obj.log.push(data)
    scrollToBottom(taskId)
  }
}



defineExpose({
  writeLog
})
</script>

<template>
  <div class="container">
    <a-tabs v-model:activeKey="activeKey" v-if="taskStackList.length">
      <a-tab-pane :key="item._id" :tab="item.taskName" v-for="(item, i) in taskStackList">
        <div class="log-container" :ref="el => setLogRef(el as HTMLElement, item._id as string)">
          <div v-for="(log, i) in item.log" :key="i" class="log-item">
            {{ log.date }}
            <DesktopOutlined />
            {{ log.taskLog }}
          </div>
        </div>
      </a-tab-pane>
    </a-tabs>
    <div v-else>
      当前没有在执行的任务
    </div>
  </div>
</template>

<style lang="scss" scoped>
.log-container {
  height: 100px;
  overflow-y: auto;
}

.container {
  height: 100%;
  overflow: hidden;

  .log {
    text-align: right;
    color: #1677ff;
    cursor: pointer;
  }
}
</style>
