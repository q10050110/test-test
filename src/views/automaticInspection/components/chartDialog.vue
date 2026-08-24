<script setup lang="ts">
import * as echarts from 'echarts'
const chartRef = ref(null)
const open = ref(false)

const yAxisRules = [
  {
    maxValue: 10,
    max: 10,
    interval: 1,
  },
  {
    maxValue: 50,
    max: 50,
    interval: 10,
  },
  {
    maxValue: 100,
    max: 100,
    interval: 10,
  },
  {
    maxValue: 200,
    max: 200,
    interval: 20,
  },
  {
    maxValue: 500,
    max: 500,
    interval: 50,
  },
  {
    maxValue: 1000,
    max: 1000,
    interval: 100,
  },
  {
    maxValue: 2000,
    max: 2000,
    interval: 200,
  },
]

const getYAxisConfig = (value: number) => {
  return (
    yAxisRules.find((item) => value <= item.maxValue) || {
      max: Math.ceil(value / 1000) * 1000,
      interval: 100,
    }
  )
}
const initChart = async (data: any[]) => {
  const dateList = data.map((item) => item.date.split(' ')[0])
  const dataList = data.map((item) => item.sellerNumber)
  const maxVal = Math.max(...dataList)
  const { max, interval } = getYAxisConfig(maxVal)
  const chart = echarts.init(chartRef.value)
  const option = {
    title: {
      text: '跟卖趋势',
      left: 'left',
      textStyle: {
        color: '#000',
        fontSize: 16,
        fontWeight: 'bold',
      },
    },
    tooltip: {
      trigger: 'axis',
      formatter: (params: any) => {
        const point = params[0]
        return `<div style="
            position: relative;
            width: 120px;
            background: #fff;
            border-radius: 12px;
            box-sizing: border-box;
            text-align: center;
        ">
          <span style="color:#999;font-size:14px;margin-bottom:5px;">${point.axisValue}</span><br/>
          <div style="color:#333;font-size:14px">
          <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#1F5FFF;margin-right:10px;"></span>跟卖人数：${point.value}</div>
        </div>`
      },
    },
    xAxis: {
      type: 'category',
      data: dateList,
    },
    yAxis: {
      type: 'value',
      min: 0,
      max,
      interval,
      axisLabel: {
        formatter: '{value}',
      },
    },
    series: [
      {
        name: '跟卖人数',
        type: 'line',
        smooth: true,
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: '#5b8ff9' },
            { offset: 1, color: '#d8e4f8' },
          ]),
        },
        lineStyle: {
          color: '#5b8ff9',
        },
        symbol: 'circle',
        symbolSize: 6,
        itemStyle: {
          color: '#5b8ff9',
        },
        data: dataList,
      },
    ],
  }

  chart.setOption(option)
}

defineExpose({
  open,
  initChart,
})
</script>

<template>
  <a-modal style="width: 50vw" v-model:open="open" :footer="false" :maskClosable="false">
    <div ref="chartRef" style="width: 100%; height: 400px" v-if="open"></div>
  </a-modal>
</template>

<style lang="scss" scoped></style>
