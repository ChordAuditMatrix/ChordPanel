<template>
  <!-- App-wide overlays. They live for the whole session, like the layout itself:
       the settings dialog opens from the sidebar, the error modal from any API
       failure, and the job drawer keeps delegations trackable from every page. -->
  <SettingsModal ref="settingsRef" />
  <ErrorModal />
  <JobProgressDrawer />
</template>

<script setup lang="ts">
import { ref } from 'vue'
import SettingsModal from '@/components/SettingsModal.vue'
import ErrorModal from '@/components/error/ErrorModal.vue'
import JobProgressDrawer from '@/components/JobProgressDrawer.vue'

const settingsRef = ref<InstanceType<typeof SettingsModal> | null>(null)

defineExpose({
  openSettings: () => settingsRef.value?.show(),
})
</script>
