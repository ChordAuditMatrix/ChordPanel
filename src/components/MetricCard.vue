<template>
  <article class="metric-card" :class="{ 'metric-card--compact': compact }" :data-tone="tone">
    <dl class="metric-card__facts">
      <dt class="metric-card__label">{{ label }}</dt>
      <dd class="metric-card__value" :class="{ 'metric-card__value--mono': mono }">
        {{ value ?? fallback }}
      </dd>
    </dl>
    <div v-if="$slots.default" class="metric-card__support">
      <slot />
    </div>
    <p v-if="hint" class="metric-card__hint">{{ hint }}</p>
  </article>
</template>

<script setup lang="ts">
type MetricTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger'

defineProps<{
  label: string
  value?: number | string | null
  fallback?: string
  tone?: MetricTone
  compact?: boolean
  mono?: boolean
  hint?: string
}>()
</script>

<style scoped>
.metric-card {
  --metric-value-color: var(--apple-gray-1);
  box-sizing: border-box;
  display: grid;
  min-width: 0;
  min-height: 68px;
  align-content: center;
  gap: 5px;
  padding: 10px 12px;
  border: 1px solid var(--apple-border);
  border-radius: var(--apple-radius-lg);
  background: var(--apple-card);
}

.metric-card[data-tone='info'] { --metric-value-color: var(--apple-blue); }
.metric-card[data-tone='success'] { --metric-value-color: var(--apple-green); }
.metric-card[data-tone='warning'] { --metric-value-color: var(--apple-orange); }
.metric-card[data-tone='danger'] { --metric-value-color: var(--apple-red); }

.metric-card__facts {
  display: grid;
  min-width: 0;
  grid-template-columns: minmax(0, 1fr);
  gap: 2px;
  margin: 0;
}

.metric-card__label {
  min-width: 0;
  color: var(--apple-gray-3);
  font-size: 12px;
  font-weight: 550;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.metric-card__value {
  min-width: 0;
  max-width: 100%;
  margin: 0;
  color: var(--metric-value-color);
  font-size: 22px;
  font-weight: 650;
  line-height: 1.15;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
  text-align: left;
}

.metric-card__value--mono {
  font-family: var(--apple-font-mono);
  font-size: 13px;
  letter-spacing: 0;
}

.metric-card__support,
.metric-card__hint {
  grid-column: 1 / -1;
  min-width: 0;
}

.metric-card__hint {
  margin: 0;
  color: var(--apple-gray-4);
  font-size: 11px;
  line-height: 1.45;
}

.metric-card--compact { min-height: 68px; }
.metric-card--compact .metric-card__value:not(.metric-card__value--mono) { font-size: 18px; }
</style>
