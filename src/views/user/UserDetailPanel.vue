<template>
  <div class="user-detail">
    <section class="detail-block">
      <header class="detail-header">
        <div class="identity">
          <h2 class="user-name">
            {{ user.userName }}
            <code class="user-id mono" :title="user.userId">({{ user.userId }})</code>
          </h2>
        </div>
        <div class="header-actions">
          <n-button size="small" @click="copy(user.userId)">{{ t('common.copy') }}</n-button>
          <n-button size="small" @click="emit('rename')">{{ t('user.workbench.renameUser') }}</n-button>
          <n-popconfirm
            :positive-text="t('common.delete')"
            :negative-text="t('common.cancel')"
            @positive-click="emit('delete')"
          >
            <template #trigger>
              <n-button size="small" type="error" ghost>{{ t('common.delete') }}</n-button>
            </template>
            {{ t('user.deleteConfirm', { name: user.userName }) }}
          </n-popconfirm>
        </div>
      </header>

      <dl class="facts">
        <div class="fact">
          <dt>{{ t('user.createdAt') }}</dt>
          <dd>{{ formatDateTime(identity?.createdAtMs ?? user.createdAtMs) }}</dd>
        </div>
        <div class="fact">
          <dt>{{ t('user.updatedAt') }}</dt>
          <dd>{{ formatDateTime(identity?.updatedAtMs ?? user.updatedAtMs) }}</dd>
        </div>
      </dl>
      <p v-if="identityState === 'error'" class="note is-error">{{ t('user.workbench.identityError') }}</p>
      <p v-else class="note">{{ t('user.workbench.identityNote') }}</p>
      <p class="note">{{ t('user.workbench.deleteNote') }}</p>
    </section>

    <section class="detail-block">
      <div class="block-head">
        <h3 class="block-title">{{ t('user.workbench.bindingsTitle') }}</h3>
        <n-button size="tiny" quaternary @click="openAlgorithms">{{ t('user.workbench.openAlgorithms') }}</n-button>
      </div>
      <p class="note">{{ t('user.workbench.bindingsDescription') }}</p>

      <p v-if="bindingState === 'loading'" class="state-line">
        {{ t('user.workbench.bindingsLoading') }}
      </p>
      <p v-else-if="bindingState === 'error'" class="state-line is-error">
        {{ t('user.workbench.bindingsError') }}
      </p>
      <p v-else-if="bindingTotal === 0" class="state-line">
        {{ t('user.workbench.bindingsNone') }}
      </p>

      <ul v-if="boundAlgorithms.length > 0" class="binding-list">
        <li v-for="item in boundAlgorithms" :key="item.algorithmId" class="binding">
          <div class="binding-main">
            <span class="binding-name">{{ algorithmEntitiesById.get(item.algorithmId)?.algorithmName || item.algorithmId }}</span>
            <span class="binding-meta">{{ item.purpose }} · v{{ item.algorithmVersion }}</span>
          </div>
          <span class="binding-id mono" :title="item.algorithmId">{{ item.algorithmId }}</span>
        </li>
      </ul>
      <p v-if="bindingState === 'ready' && bindingTotal > 0" class="note coverage">
        {{ t('user.workbench.bindingsCount', { n: bindingTotal }) }}
      </p>
    </section>

    <section class="detail-block">
      <div class="block-head">
        <h3 class="block-title">{{ t('user.workbench.ownershipTitle') }}</h3>
        <n-button size="tiny" quaternary @click="openOwnership">{{ t('user.workbench.openOwnership') }}</n-button>
      </div>
      <p class="note">{{ t('user.workbench.ownershipIdNote') }}</p>
    </section>

    <section class="detail-block">
      <div class="block-head">
        <h3 class="block-title">{{ t('user.workbench.jobsTitle') }}</h3>
        <n-button size="tiny" quaternary @click="openJobs">{{ t('user.workbench.openJobs') }}</n-button>
      </div>
      <p class="note">{{ t('user.workbench.jobsDescription') }}</p>

      <p v-if="jobState === 'loading'" class="state-line">{{ t('common.loading') }}</p>
      <p v-else-if="jobState === 'error'" class="state-line is-error">{{ t('user.workbench.jobsError') }}</p>
      <p v-else-if="jobTotal === 0" class="state-line">{{ t('user.workbench.jobsNone') }}</p>
      <p v-else-if="jobs.length === 0" class="state-line">{{ t('user.workbench.jobsRowsUnavailable') }}</p>

      <ul v-if="jobs.length > 0" class="job-list">
        <li v-for="job in jobs" :key="job.jobId" class="job-row">
          <button type="button" class="job-button" @click="openExecution(job.jobId)">
            <span class="job-type">{{ jobTypeLabel(job.jobType, t) }}</span>
            <n-tag :type="jobStatusTagType(job.status)" size="small" :bordered="false">
              {{ jobStatusLabel(job.status, t) }}
            </n-tag>
            <span class="job-time">{{ formatDateTime(job.createdAtMs) }}</span>
            <span class="job-id mono">{{ job.jobId }}</span>
          </button>
        </li>
      </ul>

      <div v-if="jobTotal > JOB_PAGE_SIZE" class="job-pager">
        <n-button size="tiny" :disabled="jobPage <= 1" @click="loadJobs(jobPage - 1)">{{ t('user.workbench.prevPage') }}</n-button>
        <span class="pager-text">{{ t('user.workbench.jobsTotal', { n: jobTotal }) }}</span>
        <n-button size="tiny" :disabled="jobPage >= jobPageCount" @click="loadJobs(jobPage + 1)">{{ t('user.workbench.nextPage') }}</n-button>
      </div>

    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useMessage } from 'naive-ui'
import { getUserDetail } from '@/api/user'
import type { User } from '@/api/user'
import { getBindings } from '@/api/algorithm'
import type { AlgorithmBindingSummary } from '@/api/algorithm'
import { getJobs } from '@/api/job'
import type { JobSummary } from '@/api/job'
import { useReferenceCatalog } from '@/stores/referenceCatalog'
import { useI18n } from '@/stores/i18n'
import { formatDateTime } from '@/utils/datetime'
import { jobStatusLabel } from '@/utils/statusLabels'
import { jobTypeLabel } from '@/utils/jobType'
import { jobStatusTagType } from '@/utils/jobStatus'
import {
  readUserBindingPage,
  readUserDetail,
  readUserJobPage,
  USER_BINDING_PAGE_SIZE,
} from './userDetail'

const JOB_PAGE_SIZE = 5

const props = defineProps<{ user: User }>()
const emit = defineEmits<{ rename: []; delete: [] }>()

const { t } = useI18n()
const message = useMessage()
const router = useRouter()
const { algorithmEntitiesById, ensureAlgorithmsLoaded } = useReferenceCatalog()

let disposed = false

const identity = ref<User | null>(null)
const identityState = ref<'loading' | 'ready' | 'error'>('loading')

const bindingState = ref<'loading' | 'ready' | 'error'>('loading')
const boundAlgorithms = ref<AlgorithmBindingSummary[]>([])
const bindingTotal = ref(0)

const jobs = ref<JobSummary[]>([])
const jobTotal = ref(0)
const jobPage = ref(1)
const jobState = ref<'loading' | 'ready' | 'error'>('loading')

const jobPageCount = computed(() => Math.max(1, Math.ceil(jobTotal.value / JOB_PAGE_SIZE)))

async function copy(value: string) {
  if (!navigator.clipboard?.writeText) {
    message.warning(t('common.operationFailed'))
    return
  }
  try {
    await navigator.clipboard.writeText(value)
    message.success(t('common.copied'))
  } catch {
    message.error(t('common.operationFailed'))
  }
}

async function loadIdentity() {
  identityState.value = 'loading'
  try {
    const detail = readUserDetail(await getUserDetail(props.user.userId))
    if (disposed) return
    identity.value = detail
    identityState.value = detail ? 'ready' : 'error'
  } catch {
    if (!disposed) identityState.value = 'error'
  }
}

async function loadBindings() {
  bindingState.value = 'loading'
  try {
    try {
      await ensureAlgorithmsLoaded()
    } catch {
      // Binding rows remain usable when optional profile names are unavailable.
    }
    const firstResponse = await getBindings({
      userId: props.user.userId,
      page: 1,
      pageSize: USER_BINDING_PAGE_SIZE,
    })
    const firstPage = readUserBindingPage(firstResponse, props.user.userId)
    if (!firstPage) throw new TypeError('Invalid user binding page')

    const items = [...firstPage.items]
    for (let page = 2; page <= firstPage.totalPages; page++) {
      const response = await getBindings({
        userId: props.user.userId,
        page,
        pageSize: USER_BINDING_PAGE_SIZE,
      })
      const parsed = readUserBindingPage(response, props.user.userId)
      if (!parsed) throw new TypeError('Invalid user binding page')
      items.push(...parsed.items)
    }
    if (disposed) return
    boundAlgorithms.value = items
    bindingTotal.value = firstPage.total
    bindingState.value = 'ready'
  } catch {
    if (!disposed) bindingState.value = 'error'
  }
}

async function loadJobs(page: number) {
  jobState.value = 'loading'
  try {
    const response = readUserJobPage(await getJobs({
      dataOwnerUserId: props.user.userId,
      page,
      pageSize: JOB_PAGE_SIZE,
      sortBy: 'createdAtMs',
      ascending: false,
    }))
    if (disposed) return
    if (!response) {
      jobState.value = 'error'
      return
    }
    jobs.value = response.items
    jobTotal.value = response.total
    jobPage.value = page
    jobState.value = 'ready'
  } catch {
    if (!disposed) jobState.value = 'error'
  }
}

function openAlgorithms() {
  void router.push({ name: 'algorithms' })
}

function openOwnership() {
  void router.push({ name: 'ownership' })
}

function openJobs() {
  void router.push({ name: 'jobs' })
}

function openExecution(jobId: string) {
  void router.push({ name: 'executionDetail', params: { jobId } })
}

onMounted(() => {
  void loadIdentity()
  void loadBindings()
  void loadJobs(1)
})

onUnmounted(() => {
  disposed = true
})
</script>

<style scoped>
.user-detail {
  display: flex;
  flex-direction: column;
  gap: var(--apple-space-6);
  padding-bottom: var(--apple-space-4);
}

.detail-block {
  min-width: 0;
}

.detail-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--apple-space-4);
  flex-wrap: wrap;
}

.user-name {
  margin: 0;
  color: var(--apple-gray-1);
  font-size: 18px;
  font-weight: 640;
  line-height: 1.3;
  overflow-wrap: anywhere;
}

 .user-id {
  display: inline-block;
  max-width: 24ch;
  overflow: hidden;
  color: var(--apple-gray-3);
  font-size: 12px;
  font-weight: 500;
  text-overflow: ellipsis;
  vertical-align: baseline;
  white-space: nowrap;
}
.header-actions {
  display: flex;
  align-items: center;
  gap: var(--apple-space-2);
  flex-wrap: wrap;
}

.block-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--apple-space-2);
}

.block-title {
  margin: 0;
  color: var(--apple-gray-3);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.045em;
  text-transform: uppercase;
}

.facts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--apple-space-3) var(--apple-space-4);
  margin: var(--apple-space-3) 0 0;
}

.fact dt {
  color: var(--apple-gray-3);
  font-size: 12px;
  line-height: 1.5;
}

.fact dd {
  margin: 2px 0 0;
  color: var(--apple-gray-1);
  font-size: 13px;
  line-height: 1.5;
}

.metric {
  font-family: var(--apple-font-mono);
  font-size: 16px;
  font-weight: 600;
}

.mono {
  font-family: var(--apple-font-mono);
  font-size: 12px;
}

.note {
  margin: var(--apple-space-2) 0 0;
  color: var(--apple-gray-3);
  font-size: 12px;
  line-height: 1.55;
}

.note.is-error,
.state-line.is-error {
  color: var(--apple-red);
}


.note.coverage {
  font-variant-numeric: tabular-nums;
}

.state-line {
  margin: var(--apple-space-2) 0 0;
  color: var(--apple-gray-2);
  font-size: 13px;
  line-height: 1.55;
}

.binding-list,
.job-list {
  display: flex;
  flex-direction: column;
  gap: var(--apple-space-2);
  margin: var(--apple-space-3) 0 0;
  padding: 0;
  list-style: none;
}

.binding {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--apple-space-3);
  min-width: 0;
  padding-bottom: var(--apple-space-2);
  border-bottom: 1px solid var(--apple-border);
}

.binding-main {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.binding-name {
  color: var(--apple-gray-1);
  font-size: 13px;
  font-weight: 600;
  overflow-wrap: anywhere;
}

.binding-meta {
  color: var(--apple-gray-3);
  font-size: 12px;
}

.binding-id {
  color: var(--apple-gray-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 44%;
}

.job-button {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--apple-space-1) var(--apple-space-3);
  width: 100%;
  padding: var(--apple-space-2);
  border: 1px solid transparent;
  border-radius: var(--apple-radius);
  background: transparent;
  color: var(--apple-gray-1);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: background-color var(--apple-dur) var(--apple-ease-out), border-color var(--apple-dur) var(--apple-ease-out);
}

.job-button:hover,
.job-button:focus-visible {
  border-color: var(--apple-border);
  background: var(--apple-gray-6);
  outline: none;
}

.job-type {
  font-size: 13px;
  font-weight: 600;
  overflow-wrap: anywhere;
}

.job-time {
  grid-column: 1;
  color: var(--apple-gray-3);
  font-size: 12px;
}

.job-id {
  grid-column: 1 / -1;
  color: var(--apple-gray-3);
  overflow-wrap: anywhere;
}

.job-pager {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--apple-space-2);
  margin-top: var(--apple-space-3);
}

.pager-text {
  color: var(--apple-gray-3);
  font-size: 12px;
}

@media (max-width: 560px) {
  .facts {
    grid-template-columns: minmax(0, 1fr);
  }

  .binding {
    flex-direction: column;
    align-items: flex-start;
  }

  .binding-id {
    max-width: 100%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .job-button {
    transition: none;
  }
}
</style>
