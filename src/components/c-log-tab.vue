<script setup lang="ts">
import { DesktopOutlined } from '@ant-design/icons-vue'
const props = defineProps<{
  eventName: string
}>()
// 标签页
const activeKey = ref()
const taskStackList = ref<any[]>([])
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
      behavior: 'smooth',
    })
  }
}
// 获取任务栈列表
const getTaskStackList = (data?: any) => {
  const { task, status } = data
  if (!task || !status) return

  if (status === 'running') {
    if (!taskStackList.value.map((item) => item._id).includes(task._id)) {
      taskStackList.value.unshift({ ...task, taskName: task?.shopName })
      activeKey.value = task._id
    }
  } else {
    taskStackList.value = taskStackList.value.filter((item) => item._id !== task._id)
    activeKey.value = taskStackList.value?.[0]?._id
  }
}

onMounted(() => {
  window.electronAPI.on(props.eventName, getTaskStackList)
})

onUnmounted(() => {
  window.electronAPI.off(props.eventName, getTaskStackList)
})

// 写入日志内容
const writeLog = (taskId: string, data: { taskLog: string; date: string }) => {
  const obj = taskStackList.value.find((item) => item._id === taskId)
  if (obj) {
    if (!obj.log) obj.log = []
    obj.log.push(data)
    scrollToBottom(taskId)
  }
}

defineExpose({
  writeLog,
  getTaskStackList,
})
</script>

<template>
  <div class="container">
    <a-tabs v-model:activeKey="activeKey" v-if="taskStackList.length">
      <a-tab-pane :key="item._id" :tab="item.taskName" v-for="(item, i) in taskStackList">
        <div class="log-container" :ref="(el) => setLogRef(el as HTMLElement, item._id as string)">
          <div v-for="(log, i) in item.log" :key="i" class="log-item" v-if="item?.log?.length">
            {{ log.date }}
            <DesktopOutlined />
            {{ log.taskLog }}
          </div>
          <div v-else class="box">
            <img src="@/assets/view/fan.png" alt="" class="rotate" /> 任务执行中
          </div>
        </div>
      </a-tab-pane>
    </a-tabs>
    <div v-else>当前没有在执行的任务</div>
  </div>
</template>

<style lang="scss" scoped>
.log-container {
  height: 80px;
  overflow-y: auto;
}

.container {
  height: 100%;
  overflow: hidden;
  background-color: #fff;
  border-radius: 10px;
  padding: 20px;
  .log {
    text-align: right;
    color: #1677ff;
    cursor: pointer;
  }
}

.box {
  padding: 15px;
  background: #ebf4ff;
  border-radius: 5px;
}

.rotate {
  width: 16px;
  height: 16px;
  animation: rotateAnimation 1s linear infinite;
  margin-right: 5px;
}

@keyframes rotateAnimation {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}
</style>
