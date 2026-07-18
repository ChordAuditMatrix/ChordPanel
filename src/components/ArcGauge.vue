<template>
  <div class="arc-gauge" :class="{ compact }" :style="{ width: width, height: height }">
    <svg :viewBox="`0 0 ${svgSize} ${svgSize}`" class="gauge-svg">
      <!-- Track arc -->
      <circle
        :cx="cx" :cy="cy" :r="radius"
        fill="none"
        :stroke="trackColor"
        :stroke-width="barWidth"
        :stroke-dasharray="arcLength + ' ' + circumference"
        :stroke-dashoffset="0"
        :transform="circleTransform"
        stroke-linecap="round"
      />
      <!-- Progress arc -->
      <circle
        :cx="cx" :cy="cy" :r="radius"
        fill="none"
        :stroke="progressColor"
        :stroke-width="barWidth"
        :stroke-dasharray="arcLength + ' ' + circumference"
        :stroke-dashoffset="dashOffset"
        :transform="circleTransform"
        stroke-linecap="round"
        class="progress-arc"
      />
    </svg>
    <div class="gauge-center">
      <span class="gauge-value">{{ displayValue }}</span>
      <span class="gauge-label">{{ label }}<template v-if="subLabel"><br/>{{ subLabel }}</template></span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, onMounted } from 'vue'
import { useTheme } from '@/stores/theme'

const props = withDefaults(defineProps<{
  value: number
  label: string
  subLabel?: string
  unit?: string
  min?: number
  max?: number
  width?: string
  height?: string
  color?: string
  compact?: boolean
}>(), {
  min: 0,
  max: 100,
  unit: '%',
  width: '180px',
  height: '160px',
  color: '',
  subLabel: '',
  compact: false,
})

const { isDark } = useTheme()

// Animated value for smooth CSS transitions
const animatedValue = ref(props.value)

// On mount, set initial value - start from 0 for first load
onMounted(() => {
  // Delay setting the value to trigger the CSS transition from 0
  requestAnimationFrame(() => {
    animatedValue.value = props.value
  })
})

// Watch props.value and smoothly animate to it
watch(() => props.value, (newVal) => {
  animatedValue.value = newVal
})

const svgSize = 200
const cx = svgSize / 2
const cy = svgSize / 2
const barWidth = computed(() => props.compact ? 8 : 18)
const radius = computed(() => cx - barWidth.value / 2 - 4)

// Arc spans 270° (from 210° to -30° in ECharts coordinate)
// In SVG circle: we rotate the circle so the gap is at the bottom
// 270° arc = 75% of full circle, gap = 90° at bottom
const arcRatio = 270 / 360 // 0.75
const circumference = computed(() => 2 * Math.PI * radius.value)
const arcLength = computed(() => circumference.value * arcRatio)

// Rotate circle: start from 135° (so the arc starts at top-left, like ECharts 210°)
const circleTransform = `rotate(135 ${cx} ${cy})`

const dashOffset = computed(() => {
  // Clamp ratio to [0, 0.995] to prevent arc from overflowing past the track end
  // (stroke-linecap:round adds half stroke-width beyond the arc endpoint)
  const ratio = Math.max(0, Math.min(0.995, (animatedValue.value - props.min) / (props.max - props.min)))
  // Full arc length minus the filled portion
  return arcLength.value * (1 - ratio)
})

const progressColor = computed(() => {
  if (props.color) return props.color
  const dark = isDark.value
  const val = animatedValue.value
  const pct = props.max === 100 ? val : (val / props.max) * 100
  if (pct < 60) return dark ? '#63E2B7' : '#18A058'
  if (pct < 80) return dark ? '#F2C97D' : '#F0A020'
  return dark ? '#E88080' : '#D03050'
})

const trackColor = computed(() => {
  return isDark.value ? 'rgba(255,255,255,0.06)' : '#EBEEF5'
})

const displayValue = computed(() => {
  const val = animatedValue.value
  if (props.max === 100) return val.toFixed(1) + props.unit
  return val.toFixed(2) + props.unit
})
</script>

<style scoped>
.arc-gauge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  position: relative;
}

.gauge-svg {
  width: 100%;
  height: 100%;
}

.progress-arc {
  transition: stroke-dashoffset 0.8s cubic-bezier(0.33, 1, 0.68, 1), stroke 0.4s ease;
}

.gauge-center {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

.gauge-value {
  font-weight: 700;
  line-height: 1.2;
  transition: color 0.3s ease;
}

.gauge-label {
  text-align: center;
  line-height: 1.3;
  transition: color 0.3s ease;
  max-width: 100%;
  overflow: hidden;
  word-break: break-all;
}

/* Normal size */
.arc-gauge:not(.compact) .gauge-value {
  font-size: 26px;
  color: v-bind(isDark ? 'rgba(255,255,255,0.85)' : '#303133');
}

.arc-gauge:not(.compact) .gauge-label {
  font-size: 10px;
  margin-top: 2px;
  color: v-bind(isDark ? 'rgba(255,255,255,0.45)' : '#909399');
}

/* Compact size */
.arc-gauge.compact .gauge-value {
  font-size: 9px;
  color: v-bind(isDark ? 'rgba(255,255,255,0.85)' : '#303133');
}

.arc-gauge.compact .gauge-label {
  font-size: 6px;
  margin-top: 1px;
  color: v-bind(isDark ? 'rgba(255,255,255,0.45)' : '#909399');
}
</style>
