<template>
  <header class="page-header">
    <div class="page-header__copy">
      <p v-if="eyebrow" class="page-header__eyebrow">{{ eyebrow }}</p>
      <div class="page-header__title-line">
        <h1 class="page-header__title">
          <slot name="title">{{ title }}</slot>
        </h1>
        <slot name="title-meta" />
      </div>
      <p v-if="description" class="page-header__description">{{ description }}</p>
      <div v-if="$slots.meta" class="page-header__meta">
        <slot name="meta" />
      </div>
    </div>
    <div v-if="$slots.actions" class="page-header__actions">
      <slot name="actions" />
    </div>
  </header>
</template>

<script setup lang="ts">
defineProps<{
  title?: string
  description?: string
  eyebrow?: string
}>()
</script>

<style scoped>
.page-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--apple-space-6, 24px);
  padding-bottom: var(--apple-space-5, 20px);
  border-bottom: 1px solid var(--apple-border);
  min-width: 0;
}

.page-header__copy {
  min-width: 0;
}

.page-header__eyebrow {
  margin: 0 0 var(--apple-space-1, 4px);
  color: var(--apple-gray-3);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.045em;
  line-height: 1.4;
}

.page-header__title-line {
  display: flex;
  align-items: center;
  gap: var(--apple-space-3, 12px);
  min-width: 0;
}

.page-header__title {
  margin: 0;
  color: var(--apple-gray-1);
  font-size: clamp(22px, 2vw, 28px);
  font-weight: 650;
  line-height: 1.2;
  letter-spacing: -0.02em;
  overflow-wrap: anywhere;
}

.page-header__description {
  max-width: 72ch;
  margin: var(--apple-space-2, 8px) 0 0;
  color: var(--apple-gray-3);
  font-size: 14px;
  line-height: 1.55;
}

.page-header__meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--apple-space-2, 8px) var(--apple-space-4, 16px);
  margin-top: var(--apple-space-3, 12px);
  color: var(--apple-gray-3);
  font-size: 12px;
  line-height: 1.5;
}

.page-header__actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: var(--apple-space-2, 8px);
  flex: 0 0 auto;
}

@media (max-width: 680px) {
  .page-header {
    align-items: stretch;
    flex-direction: column;
    gap: var(--apple-space-3, 12px);
  }

  .page-header__actions {
    justify-content: flex-start;
  }
}
</style>
