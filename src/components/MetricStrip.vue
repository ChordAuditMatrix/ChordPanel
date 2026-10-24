<template>
  <div class="metric-strip" :class="`metric-strip--${columns}`" :role="label ? 'group' : undefined" :aria-label="label">
    <slot />
  </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  columns?: 2 | 3 | 4
  label?: string
}>(), { columns: 4 })
</script>

<style scoped>
.metric-strip {
  display: grid;
  min-width: 0;
  grid-template-columns: repeat(var(--metric-columns, 4), minmax(0, 1fr));
  gap: 12px;
}

.metric-strip--2 { --metric-columns: 2; }
.metric-strip--3 { --metric-columns: 3; }
.metric-strip--4 { --metric-columns: 4; }

@media (max-width: 960px) {
  .metric-strip--3,
  .metric-strip--4 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 520px) {
  .metric-strip { grid-template-columns: minmax(0, 1fr); }
}
</style>
