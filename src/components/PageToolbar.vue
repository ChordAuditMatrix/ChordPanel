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
  margin-bottom: 0;
}
.filters {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
}
.actions {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
}
@media (max-width: 640px) {
  .page-toolbar { flex-direction: column; align-items: stretch; }
  .filters :slotted(*) { width: 100% !important; }
  .actions { justify-content: flex-end; }
}
</style>
