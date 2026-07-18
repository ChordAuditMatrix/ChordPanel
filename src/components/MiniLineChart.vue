<template>
  <div ref="chartRef" class="mini-chart"></div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import * as echarts from 'echarts/core'
import { LineChart } from 'echarts/charts'
import { CanvasRenderer } from 'echarts/renderers'
import { GridComponent } from 'echarts/components'
import { useTheme } from '@/stores/theme'

echarts.use([LineChart, CanvasRenderer, GridComponent])

const props = withDefaults(defineProps<{
  data: number[]
  color?: string
}>(), {
  color: '#63E2B7',
})

const { isDark } = useTheme()
const chartRef = ref<HTMLDivElement | null>(null)
let chart: echarts.ECharts | null = null
let resizeObserver: ResizeObserver | null = null

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

function getOption() {
  const dark = isDark.value
  const lineColor = props.color
  const areaBottom = dark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)'

  return {
    backgroundColor: 'transparent',
    grid: { top: 2, right: 0, bottom: 2, left: 0 },
    xAxis: { show: false, type: 'category', data: props.data.map((_, i) => i), boundaryGap: false },
    yAxis: { show: false, type: 'value', min: 0 },
    series: [{
      type: 'line',
      data: props.data,
      smooth: true,
      symbol: 'none',
      lineStyle: { width: 1.5, color: lineColor },
      areaStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: hexToRgba(lineColor, 0.25) },
          { offset: 1, color: areaBottom },
        ]),
      },
    }],
    animation: false,
  }
}

function initChart() {
  if (!chartRef.value) return
  chart = echarts.init(chartRef.value)
  chart.setOption(getOption())
  // Ensure canvas size matches the container
  chart.resize()
}

function updateChart() {
  if (!chart) return
  chart.setOption(getOption())
}

onMounted(() => {
  initChart()
  // Listen for container size changes and auto-resize
  if (chartRef.value) {
    resizeObserver = new ResizeObserver(() => {
      chart?.resize()
    })
    resizeObserver.observe(chartRef.value)
  }
})
watch([() => props.data, isDark], updateChart, { deep: true })
onUnmounted(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
  chart?.dispose()
  chart = null
})
</script>

<style scoped>
.mini-chart {
  width: 100%;
  min-width: 60px;
  height: 40px;
}
</style>
