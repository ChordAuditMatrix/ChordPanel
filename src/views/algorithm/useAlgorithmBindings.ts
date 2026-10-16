import axios from 'axios'
import { ref, watch } from 'vue'
import { useMessage } from 'naive-ui'
import { bindUser, listProfileBindings, unbindUser } from '@/api/algorithm'
import type { AlgorithmProfile } from '@/api/algorithm'
import { useReferenceCatalog } from '@/stores/referenceCatalog'
import { useI18n } from '@/stores/i18n'

export interface BoundUser {
  userId: string
  userName?: string
}

export function useAlgorithmBindings() {
  const message = useMessage()
  const { t } = useI18n()
  function responseMessage(cause: unknown, fallbackKey: string): string {
    if (!axios.isAxiosError<{ message?: string; error?: string }>(cause)) return t(fallbackKey)
    return cause.response?.data?.message || cause.response?.data?.error || t(fallbackKey)
  }
  const { userEntitiesById, ensureUsersLoaded } = useReferenceCatalog()
  const showBindModal = ref(false)
  const bindLoading = ref(false)
  const bindSubmitLoading = ref(false)
  const bindProfile = ref<AlgorithmProfile | null>(null)
  const bindUserId = ref('')
  const boundUsers = ref<BoundUser[]>([])
  const bindingPage = ref(1)
  const bindingPageSize = ref(5)
  const bindingTotal = ref(0)
  let bindingSequence = 0

  async function loadBoundUsers(algorithmId: string, requestedPage = bindingPage.value) {
    const sequence = ++bindingSequence
    bindLoading.value = true
    boundUsers.value = []
    try {
      const response = await listProfileBindings(algorithmId, { page: requestedPage, pageSize: bindingPageSize.value })
      await ensureUsersLoaded()
      if (sequence !== bindingSequence) return
      boundUsers.value = response.items.map(binding => ({
        userId: binding.userId,
        userName: binding.userName || userEntitiesById.value.get(binding.userId)?.userName,
      }))
      bindingTotal.value = response.total
    } catch (cause) {
      if (sequence === bindingSequence) message.error(responseMessage(cause, 'algorithm.loadBindingsFailed'))
    } finally {
      if (sequence === bindingSequence) bindLoading.value = false
    }
  }

  async function openBindModal(profile: AlgorithmProfile) {
    bindProfile.value = profile
    bindUserId.value = ''
    boundUsers.value = []
    bindingPage.value = 1
    bindingTotal.value = 0
    showBindModal.value = true
    await loadBoundUsers(profile.algorithmId, 1)
  }

  async function handleBind() {
    const profile = bindProfile.value
    if (!profile || !bindUserId.value) return
    bindSubmitLoading.value = true
    try {
      await bindUser(profile.algorithmId, bindUserId.value)
      message.success(t('algorithm.bindSuccess'))
      bindUserId.value = ''
      if (bindingPage.value === 1) await loadBoundUsers(profile.algorithmId, 1)
      else bindingPage.value = 1
    } catch (cause) {
      message.error(responseMessage(cause, 'algorithm.bindFailed'))
    } finally {
      bindSubmitLoading.value = false
    }
  }

  async function handleUnbind(user: BoundUser) {
    const profile = bindProfile.value
    if (!profile) return
    try {
      await unbindUser(profile.algorithmId, user.userId)
      message.success(t('algorithm.unbindSuccess'))
      if (bindingPage.value === 1) await loadBoundUsers(profile.algorithmId, 1)
      else bindingPage.value = 1
    } catch (cause) {
      message.error(responseMessage(cause, 'algorithm.unbindFailed'))
    }
  }

  watch([bindingPage, bindingPageSize], ([page, pageSize], [previousPage, previousPageSize]) => {
    const profile = bindProfile.value
    if (!showBindModal.value || !profile) return
    if (pageSize !== previousPageSize && page !== 1) {
      bindingPage.value = 1
      return
    }
    if (page !== previousPage || pageSize !== previousPageSize) void loadBoundUsers(profile.algorithmId, page)
  })

  return {
    showBindModal,
    bindLoading,
    bindSubmitLoading,
    bindProfile,
    bindUserId,
    boundUsers,
    bindingPage,
    bindingPageSize,
    bindingTotal,
    openBindModal,
    handleBind,
    handleUnbind,
  }
}
