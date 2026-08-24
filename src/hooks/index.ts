import type { ColumnType } from 'ant-design-vue/es/table'
/**
 * 动态计算表格高度的 Hook
 * @param containerSelector 容器选择器，默认为 '.table-container'
 * @param offset 需要减去的高度偏移量（例如分页器高度 + 边距），默认 55px
 */
export function useTableHeight(containerSelector: string = '.table-container', offset: number = 55, columns: ColumnType<any>[] = []) {
  const height = ref<number>(0)
  const width = columns.reduce((sum, col) => sum + ((col.width as number) || 0), 0)
  let resizeObserver: ResizeObserver | null = null

  const calculateHeight = () => {
    nextTick(() => {
      const container = document.querySelector(containerSelector)
      if (container) {
        const h = container.clientHeight - offset
        height.value = h > 0 ? h : 200
      }
    })
  }

  onMounted(() => {
    calculateHeight()
    const target = document.querySelector(containerSelector)
    if (target) {
      resizeObserver = new ResizeObserver(() => {
        calculateHeight()
      })
      resizeObserver.observe(target)
    } else {
      window.addEventListener('resize', calculateHeight)
    }
  })

  onBeforeUnmount(() => {
    if (resizeObserver) {
      resizeObserver.disconnect()
    } else {
      window.removeEventListener('resize', calculateHeight)
    }
  })

  return {
    width,
    height,
    calculateHeight
  }
}