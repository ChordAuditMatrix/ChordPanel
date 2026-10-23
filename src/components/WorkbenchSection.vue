<template>
  <section class="workbench-section" :class="{ 'workbench-section--divided': divided }">
    <header v-if="title || description || $slots.actions" class="workbench-section__header">
      <div class="workbench-section__heading">
        <h2 v-if="title" class="workbench-section__title">{{ title }}</h2>
        <p v-if="description" class="workbench-section__description">{{ description }}</p>
      </div>
      <div v-if="$slots.actions" class="workbench-section__actions">
        <slot name="actions" />
      </div>
    </header>
    <div class="workbench-section__content">
      <slot />
    </div>
  </section>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  title?: string
  description?: string
  divided?: boolean
}>(), { divided: false })
</script>

<style scoped>
.workbench-section {
  min-width: 0;
}

.workbench-section--divided {
  border-top: 1px solid var(--apple-border);
  padding-top: var(--apple-space-5, 20px);
}

.workbench-section__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--apple-space-4, 16px);
  margin-bottom: var(--apple-space-4, 16px);
}

.workbench-section__heading {
  min-width: 0;
}

.workbench-section__title {
  margin: 0;
  color: var(--apple-gray-1);
  font-size: 16px;
  font-weight: 620;
  line-height: 1.35;
}

.workbench-section__description {
  max-width: 76ch;
  margin: var(--apple-space-1, 4px) 0 0;
  color: var(--apple-gray-3);
  font-size: 13px;
  line-height: 1.5;
}

.workbench-section__actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: var(--apple-space-2, 8px);
  flex: 0 0 auto;
}

.workbench-section__content {
  min-width: 0;
}

@media (max-width: 680px) {
  .workbench-section__header {
    flex-direction: column;
    gap: var(--apple-space-2, 8px);
  }

  .workbench-section__actions {
    justify-content: flex-start;
  }
}
</style>
