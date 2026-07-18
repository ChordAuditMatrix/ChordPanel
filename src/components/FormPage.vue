<template>
  <div class="form-page">
    <div class="form-page-inner">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ maxWidth?: string }>(), { maxWidth: '640px' })
</script>

<style scoped>
.form-page {
  display: flex;
  justify-content: center;
  width: 100%;
}
.form-page-inner {
  width: 100%;
  max-width: v-bind(maxWidth);
}
</style>
