import type { JobDetail, JobSummary, TaskSummary } from '@/api/job'
import type { TraceExecutionKind, TraceObservation, TraceSummary } from '@/api/trace'
import { projectExecutionMetricSummary } from './executionDisplayProjection'

const UINT64_PATTERN = /^(0|[1-9][0-9]*)$/
const UINT64_MAX = 18_446_744_073_709_551_615n

export type StageUserRole = 'jobOwner' | 'initiator' | 'dataOwner' | 'user'
export type StageUserSource = 'traceSummary' | 'jobSnapshot' | 'jobMetadata' | 'taskResult'
export type StageUserNameSource = StageUserSource | 'currentCatalog' | 'unknown'

export interface StageUserReference {
  role: StageUserRole
  userId: string
  userName: string | null
  source: StageUserSource
  nameSource: StageUserNameSource
}

export interface StageUserReferenceProjection {
  users: StageUserReference[]
  identityDataOwnerCount: string | null
  identityDataOwnerCountSource: 'observation' | 'traceSummary' | null
  unlistedIdentityDataOwnerCount: string | null
}

export interface StageRootHashPresence {
  present: boolean
  source: 'traceSummary' | 'observation'
  observationId: string | null
}

export interface IdentityRootHashDetails {
  completionVisible: boolean
  presenceFacts: StageRootHashPresence[]
  ownerRootHashCount: { value: string; source: 'traceSummary' | 'observation' } | null
  rootHashValue: { value: string; source: 'jobMetadata' } | null
}

interface UserReferenceInput {
  activeJobId: string
  kind: TraceExecutionKind | null
  stageId: string | null
  mode: 'live' | 'replay'
  observations: readonly TraceObservation[]
  summary: TraceSummary | null
  jobSnapshot: JobSummary | null
  jobDetail: JobDetail | null
  tasks: readonly TaskSummary[]
  userNamesById: ReadonlyMap<string, string>
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function count(value: unknown): string | null {
  if (typeof value !== 'string' || !UINT64_PATTERN.test(value)) return null
  try {
    return BigInt(value) <= UINT64_MAX ? value : null
  } catch {
    return null
  }
}

function readUserId(value: unknown): string | null {
  if (typeof value === 'string') return text(value)
  const entry = object(value)
  return text(entry?.userId) ?? text(entry?.id)
}

function readUserName(value: unknown): string | null {
  const entry = object(value)
  return text(entry?.userName) ?? text(entry?.name)
}

function parseIdArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  if (typeof value !== 'string' || value.trim() === '') return []
  const text = value.trim()
  if (!text.startsWith('[')) return text.split(',').map(id => id.trim()).filter(Boolean)
  try {
    const parsed: unknown = JSON.parse(text)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function latestOwnerCount(
  observations: readonly TraceObservation[],
  activeJobId: string,
): { value: string; source: 'observation' } | null {
  let latest: TraceObservation | null = null
  for (const observation of observations) {
    if (observation.jobId !== activeJobId || !Object.prototype.hasOwnProperty.call(observation.metrics, 'ownerCount')) continue
    if (!latest || observation.recordedAtMs > latest.recordedAtMs
      || (observation.recordedAtMs === latest.recordedAtMs && observation.observationId > latest.observationId)) {
      latest = observation
    }
  }
  const value = count(latest?.metrics.ownerCount)
  return value === null ? null : { value, source: 'observation' }
}

/** Project only explicit user references; counts never create user identities. */
export function projectStageUserReferences(input: UserReferenceInput): StageUserReferenceProjection {
  const users = new Map<string, StageUserReference>()
  const sourcePriority: Record<StageUserNameSource, number> = {
    traceSummary: 5,
    jobSnapshot: 4,
    jobMetadata: 3,
    taskResult: 2,
    currentCatalog: 1,
    unknown: 0,
  }

  function add(role: StageUserRole, rawId: unknown, rawName: unknown, source: StageUserSource): void {
    const userId = readUserId(rawId)
    if (!userId) return
    const explicitName = text(rawName)
    const catalogName = text(input.userNamesById.get(userId))
    const userName = explicitName ?? catalogName
    const nameSource: StageUserNameSource = explicitName ? source : catalogName ? 'currentCatalog' : 'unknown'
    const key = `${role}:${userId}`
    const existing = users.get(key)
    if (!existing) {
      users.set(key, { role, userId, userName, source, nameSource })
      return
    }
    if (sourcePriority[nameSource] > sourcePriority[existing.nameSource]) {
      users.set(key, { ...existing, userName, nameSource })
    }
  }

  function addContainer(container: Record<string, unknown>, source: StageUserSource): void {
    const scalarFields: Array<[string, StageUserRole, readonly string[]]> = [
      ['ownerId', 'dataOwner', ['ownerName']],
      ['dataOwnerId', 'jobOwner', ['dataOwnerName', 'dataOwnerUserName']],
      ['dataOwnerUserId', 'jobOwner', ['dataOwnerName', 'dataOwnerUserName']],
      ['initiatorId', 'initiator', ['initiatorName', 'initiatorUserName']],
      ['initiatorUserId', 'initiator', ['initiatorName', 'initiatorUserName']],
      ['userId', 'user', ['userName']],
    ]
    for (const [idKey, role, siblingKeys] of scalarFields) {
      const id = container[idKey]
      let name: unknown = null
      for (const siblingKey of siblingKeys) {
        if (text(container[siblingKey])) {
          name = container[siblingKey]
          break
        }
      }
      add(role, id, name, source)
    }

    for (const [listKey, role] of [['ownerIds', 'dataOwner'], ['userIds', 'user']] as const) {
      for (const entry of parseIdArray(container[listKey])) {
        add(role, entry, readUserName(entry), source)
      }
    }

    for (const [listKey, role] of [['owners', 'dataOwner'], ['users', 'user']] as const) {
      const entries = container[listKey]
      if (!Array.isArray(entries)) continue
      for (const entry of entries) add(role, entry, readUserName(entry), source)
    }

    for (const [fieldKey, role] of [['owner', 'dataOwner'], ['dataOwner', 'jobOwner'], ['initiator', 'initiator']] as const) {
      const entry = object(container[fieldKey])
      if (entry) add(role, entry.userId, entry.userName, source)
    }
  }

  const matchingSummary = input.summary?.jobId === input.activeJobId ? input.summary : null
  add('jobOwner', matchingSummary?.references.owner?.userId, matchingSummary?.references.owner?.userName, 'traceSummary')
  add('initiator', matchingSummary?.references.initiator?.userId, matchingSummary?.references.initiator?.userName, 'traceSummary')

  const matchingJob = input.jobSnapshot?.jobId === input.activeJobId ? input.jobSnapshot : null
  add('jobOwner', matchingJob?.dataOwner?.userId, matchingJob?.dataOwner?.userName, 'jobSnapshot')
  add('initiator', matchingJob?.initiator?.userId, matchingJob?.initiator?.userName, 'jobSnapshot')

  if (input.mode === 'live' && input.jobDetail?.jobId === input.activeJobId) {
    const metadata = object(input.jobDetail.metadata)
    if (metadata) addContainer(metadata, 'jobMetadata')
  }

  if (input.mode === 'live') {
    const taskIds = new Set(input.observations
      .filter(observation => observation.jobId === input.activeJobId)
      .map(observation => observation.refs.taskId)
      .filter((taskId): taskId is string => Boolean(taskId)))
    for (const task of input.tasks) {
      if (task.jobId !== input.activeJobId || !taskIds.has(task.taskId) || !task.resultSummary) continue
      addContainer(task.resultSummary, 'taskResult')
    }
  }

  const orderedUsers = [...users.values()].sort((left, right) => {
    const roleOrder: Record<StageUserRole, number> = { jobOwner: 0, dataOwner: 1, initiator: 2, user: 3 }
    return roleOrder[left.role] - roleOrder[right.role] || left.userId.localeCompare(right.userId)
  })
  const identityDataOwnerIds = new Set(orderedUsers
    .filter(user => user.role === 'dataOwner')
    .map(user => user.userId))
  const completionVisible = input.stageId === 'verification'
    && input.observations.some(observation =>
      observation.jobId === input.activeJobId
      && observation.eventType === 'IdentityVerificationCompleted',
    )
  const summaryOwnerCount = input.mode === 'live' && completionVisible
    ? count(matchingSummary?.references.ownerCount)
    : null
  const observedOwnerCount = input.kind === 'identityVerification'
    ? latestOwnerCount(input.observations, input.activeJobId)
    : null
  const identityDataOwnerCount = observedOwnerCount?.value ?? summaryOwnerCount
  const identityDataOwnerCountSource = observedOwnerCount?.source ?? (summaryOwnerCount !== null ? 'traceSummary' : null)
  let unlistedIdentityDataOwnerCount: string | null = null
  if (identityDataOwnerCount !== null) {
    const missing = BigInt(identityDataOwnerCount) - BigInt(identityDataOwnerIds.size)
    if (missing > 0n) unlistedIdentityDataOwnerCount = missing.toString()
  }

  return {
    users: orderedUsers,
    identityDataOwnerCount,
    identityDataOwnerCountSource,
    unlistedIdentityDataOwnerCount,
  }
}

/** Root-hash facts use only pointer-visible evidence during replay. */
export function projectIdentityRootHashDetails(input: {
  activeJobId: string
  kind: TraceExecutionKind | null
  stageId: string | null
  mode: 'live' | 'replay'
  observations: readonly TraceObservation[]
  summary: TraceSummary | null
  jobDetail: JobDetail | null
}): IdentityRootHashDetails | null {
  if (input.kind !== 'identityVerification' || input.stageId !== 'verification') return null
  const completions = input.observations.filter(observation =>
    observation.jobId === input.activeJobId && observation.eventType === 'IdentityVerificationCompleted',
  )
  if (completions.length === 0) {
    return { completionVisible: false, presenceFacts: [], ownerRootHashCount: null, rootHashValue: null }
  }

  const summary = input.mode === 'live' && input.summary?.jobId === input.activeJobId
    ? input.summary
    : null
  const presenceFacts: StageRootHashPresence[] = []
  if (typeof summary?.references.rootHashPresent === 'boolean') {
    presenceFacts.push({ present: summary.references.rootHashPresent, source: 'traceSummary', observationId: null })
  }
  for (const observation of completions) {
    const metric = projectExecutionMetricSummary(
      'identityVerification',
      observation.eventType,
      'rootHashPresentCount',
      observation.metrics.rootHashPresentCount ?? '',
    )
    if (metric?.kind === 'rootHashPresence') {
      presenceFacts.push({ present: metric.present, source: 'observation', observationId: observation.observationId })
    }
  }

  const lastCompletion = completions.reduce((latest, observation) =>
    observation.recordedAtMs > latest.recordedAtMs
      || (observation.recordedAtMs === latest.recordedAtMs && observation.observationId > latest.observationId)
      ? observation
      : latest,
  )
  const summaryOwnerRootHashCount = count(summary?.references.ownerRootHashCount)
  const observationOwnerRootHashCount = count(lastCompletion.metrics.ownerRootHashCount)
  const ownerRootHashCount = summaryOwnerRootHashCount !== null
    ? { value: summaryOwnerRootHashCount, source: 'traceSummary' as const }
    : observationOwnerRootHashCount !== null
      ? { value: observationOwnerRootHashCount, source: 'observation' as const }
      : null
  const metadata = input.mode === 'live' && input.jobDetail?.jobId === input.activeJobId
    ? object(input.jobDetail.metadata)
    : null
  const rawRootHash = text(metadata?._rootHash) ?? text(metadata?.rootHash)
  const rootHashValue = rawRootHash ? { value: rawRootHash, source: 'jobMetadata' as const } : null
  return { completionVisible: true, presenceFacts, ownerRootHashCount, rootHashValue }
}
