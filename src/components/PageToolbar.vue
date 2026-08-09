<template>
  <div class="page-toolbar">
    <div class="filters">
      <slot />
    </div>
    <div class="actions">
      <slot name="actions" />
    </div>
  </div>
</template>

<script setup lang="ts"></script>

<style scoped>
.page-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 4px;
}
.filters {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}
.actions {
  display: flex;
  gap: 8px;
  align-items: center;
}
@media (max-width: 640px) {
  .page-toolbar { flex-direction: column; align-items: stretch; }
  .actions { justify-content: flex-end; }
}
</style>
