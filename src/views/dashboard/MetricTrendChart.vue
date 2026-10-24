<template>
  <svg
    v-if="plot.points.length >= 2"
    class="metric-trend-chart"
    viewBox="0 0 160 36"
    preserveAspectRatio="none"
    role="img"
    :aria-label="label"
  >
    <title>{{ label }}</title>
    <line class="trend-grid" x1="0" y1="30" x2="160" y2="30" />
    <polyline
      :points="pointString"
      fill="none"
      :stroke="color"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
    <circle v-if="plot.last" :cx="plot.last.x" :cy="plot.last.y" r="2.5" :fill="color" />
  </svg>
  <div v-else class="metric-trend-waiting" aria-hidden="true" />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { MetricPoint } from './types'

interface PlotPoint {
  x: number
  y: number
}

const props = defineProps<{
  label: string
  points: readonly MetricPoint[]
  color: string
}>()

const plot = computed(() => {
  const points = props.points.filter(point =>
    Number.isFinite(point.observedAtMs) && Number.isFinite(point.value))
  if (points.length < 2) return { points: [] as PlotPoint[], last: null as PlotPoint | null }

  const firstTime = points[0].observedAtMs
  const timeSpan = points[points.length - 1].observedAtMs - firstTime
  const minValue = Math.min(...points.map(point => point.value))
  const maxValue = Math.max(...points.map(point => point.value))
  const valueSpan = maxValue - minValue || Math.max(Math.abs(maxValue) * 0.08, 1)
  const lowerValue = maxValue === minValue ? minValue - valueSpan / 2 : minValue
  const top = 5
  const bottom = 30
  const horizontalPadding = 4
  const verticalSpan = bottom - top
  const horizontalSpan = 160 - horizontalPadding * 2

  const plotted = points.map((point, index) => {
    const timeRatio = timeSpan > 0
      ? (point.observedAtMs - firstTime) / timeSpan
      : index / (points.length - 1)
    const valueRatio = (point.value - lowerValue) / valueSpan
    return {
      x: horizontalPadding + timeRatio * horizontalSpan,
      y: bottom - valueRatio * verticalSpan,
    }
  })

  return { points: plotted, last: plotted[plotted.length - 1] }
})

const pointString = computed(() => plot.value.points
  .map(point => `${point.x.toFixed(1)},${point.y.toFixed(1)}`)
  .join(' '))
</script>

<style scoped>
.metric-trend-chart,
.metric-trend-waiting {
  display: block;
  width: 100%;
  height: 34px;
}
.metric-trend-chart { overflow: visible; }
.trend-grid { stroke: var(--apple-gray-6); stroke-width: 1; stroke-dasharray: 2 4; opacity: 0.55; }
</style>
