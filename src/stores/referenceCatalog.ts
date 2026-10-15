import { ref, reactive } from 'vue'
import { getUsers } from '@/api/user'
import type { User } from '@/api/user'
import { getProfiles } from '@/api/algorithm'
import type { AlgorithmProfile } from '@/api/algorithm'
import { listAuditTables } from '@/api/auditTables'
import type { AuditTable } from '@/api/auditTables'
import type { JsonValueFormatter } from '@/components/JsonKeyValue.vue'
import { t } from '@/stores/i18n'

const PAGE_SIZE = 1000
const TTL_MS = 60_000

export interface CatalogSliceState {
  loading: boolean
  error: unknown | null
  lastLoadedAt: number | null
}

const usersById = ref<Map<string, string>>(new Map())
const userEntitiesById = ref<Map<string, User>>(new Map())
const algorithmsById = ref<Map<string, string>>(new Map())
const algorithmEntitiesById = ref<Map<string, AlgorithmProfile>>(new Map())
const auditTables = ref<AuditTable[]>([])
const auditTablesById = ref<Map<string, AuditTable>>(new Map())
const usersState = reactive<CatalogSliceState>({ loading: false, error: null, lastLoadedAt: null })
const algorithmsState = reactive<CatalogSliceState>({ loading: false, error: null, lastLoadedAt: null })
const auditTablesState = reactive<CatalogSliceState>({ loading: false, error: null, lastLoadedAt: null })
let usersInflight: Promise<void> | null = null
let algorithmsInflight: Promise<void> | null = null
let auditTablesInflight: Promise<void> | null = null
let usersSequence = 0
let algorithmsSequence = 0
let auditTablesSequence = 0
const usersRefreshQueue: { promise: Promise<void> | null } = { promise: null }
const algorithmsRefreshQueue: { promise: Promise<void> | null } = { promise: null }
const auditTablesRefreshQueue: { promise: Promise<void> | null } = { promise: null }

function refreshAfterInflight(
  current: Promise<void>,
  queue: { promise: Promise<void> | null },
  refresh: () => Promise<void>,
): Promise<void> {
  if (queue.promise) return queue.promise
  let queued: Promise<void>
  queued = current.then(refresh).finally(() => {
    if (queue.promise === queued) queue.promise = null
  })
  queue.promise = queued
  return queued
}

function hasText(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0
}

interface PageEnvelope { items: unknown[]; total: number; totalPages: number }
function readEnvelope(res: unknown): PageEnvelope {
  if (!res || typeof res !== 'object') return { items: [], total: 0, totalPages: 0 }
  return {
    items: 'items' in res && Array.isArray(res.items) ? res.items : [],
    total: 'total' in res && typeof res.total === 'number' ? res.total : 0,
    totalPages: 'totalPages' in res && typeof res.totalPages === 'number' ? res.totalPages : 0,
  }
}

interface SelectedEntry { id: string; name: string; entity: unknown }
interface LoadedEntries { names: Map<string, string>; entities: Map<string, unknown> }
async function loadEntries(fetcher: (params: { page: number; pageSize: number }) => Promise<unknown>, select: (item: unknown) => SelectedEntry | null): Promise<LoadedEntries> {
  const names = new Map<string, string>()
  const entities = new Map<string, unknown>()
  const first = readEnvelope(await fetcher({ page: 1, pageSize: PAGE_SIZE }))
  const addItems = (items: unknown[]) => {
    for (const item of items) {
      const entry = select(item)
      if (entry) {
        names.set(entry.id, entry.name)
        entities.set(entry.id, entry.entity)
      }
    }
  }
  addItems(first.items)
  const pages = first.totalPages > 0 ? first.totalPages : first.total > 0 ? Math.ceil(first.total / PAGE_SIZE) : first.items.length ? 1 : 0
  for (let page = 2; page <= pages; page++) {
    const { items } = readEnvelope(await fetcher({ page, pageSize: PAGE_SIZE }))
    if (!items.length) break
    addItems(items)
  }
  return { names, entities }
}

function selectUser(item: unknown): SelectedEntry | null {
  if (!item || typeof item !== 'object' || !('userId' in item) || !hasText(item.userId)) return null
  return { id: item.userId.trim(), name: 'userName' in item && hasText(item.userName) ? item.userName.trim() : '', entity: item }
}
function selectAlgorithm(item: unknown): SelectedEntry | null {
  if (!item || typeof item !== 'object' || !('algorithmId' in item) || !hasText(item.algorithmId)) return null
  return { id: item.algorithmId.trim(), name: 'algorithmName' in item && hasText(item.algorithmName) ? item.algorithmName.trim() : '', entity: item }
}

function loadUsers(force = false): Promise<void> {
  if (usersInflight) return force ? refreshAfterInflight(usersInflight, usersRefreshQueue, () => loadUsers(true)) : usersInflight
  if (!force && usersState.lastLoadedAt !== null && Date.now() - usersState.lastLoadedAt < TTL_MS) return Promise.resolve()
  const sequence = ++usersSequence
  usersState.loading = true
  usersState.error = null
  usersInflight = loadEntries(getUsers, selectUser).then(value => {
    if (sequence === usersSequence) {
      usersById.value = value.names
      userEntitiesById.value = value.entities as Map<string, User>
      usersState.lastLoadedAt = Date.now()
    }
  }).catch(error => {
    if (sequence === usersSequence) usersState.error = error
  }).finally(() => {
    if (sequence === usersSequence) usersState.loading = false
    usersInflight = null
  })
  return usersInflight
}

function loadAlgorithms(force = false): Promise<void> {
  if (algorithmsInflight) return force ? refreshAfterInflight(algorithmsInflight, algorithmsRefreshQueue, () => loadAlgorithms(true)) : algorithmsInflight
  if (!force && algorithmsState.lastLoadedAt !== null && Date.now() - algorithmsState.lastLoadedAt < TTL_MS) return Promise.resolve()
  const sequence = ++algorithmsSequence
  algorithmsState.loading = true
  algorithmsState.error = null
  algorithmsInflight = loadEntries(getProfiles, selectAlgorithm).then(value => {
    if (sequence === algorithmsSequence) {
      algorithmsById.value = value.names
      algorithmEntitiesById.value = value.entities as Map<string, AlgorithmProfile>
      algorithmsState.lastLoadedAt = Date.now()
    }
  }).catch(error => {
    if (sequence === algorithmsSequence) algorithmsState.error = error
  }).finally(() => {
    if (sequence === algorithmsSequence) algorithmsState.loading = false
    algorithmsInflight = null
  })
  return algorithmsInflight
}

function loadAuditTables(force = false): Promise<void> {
  if (auditTablesInflight) return force ? refreshAfterInflight(auditTablesInflight, auditTablesRefreshQueue, () => loadAuditTables(true)) : auditTablesInflight
  if (!force && auditTablesState.lastLoadedAt !== null && Date.now() - auditTablesState.lastLoadedAt < TTL_MS) return Promise.resolve()
  const sequence = ++auditTablesSequence
  auditTablesState.loading = true
  auditTablesState.error = null
  auditTablesInflight = (async () => {
    const response = await listAuditTables({ page: 1, pageSize: PAGE_SIZE }) as unknown as { items: AuditTable[]; totalPages: number; total: number }
    const items = [...(Array.isArray(response.items) ? response.items : [])]
    const pages = response.totalPages > 0 ? response.totalPages : response.total > 0 ? Math.ceil(response.total / PAGE_SIZE) : items.length ? 1 : 0
    for (let page = 2; page <= pages; page++) {
      const next = await listAuditTables({ page, pageSize: PAGE_SIZE }) as unknown as { items: AuditTable[] }
      if (!Array.isArray(next.items) || !next.items.length) break
      items.push(...next.items)
    }
    if (sequence === auditTablesSequence) {
      auditTables.value = items
      auditTablesById.value = new Map(items.map(item => [item.tableId, item]))
      auditTablesState.lastLoadedAt = Date.now()
    }
  })().catch(error => {
    if (sequence === auditTablesSequence) auditTablesState.error = error
  }).finally(() => {
    if (sequence === auditTablesSequence) auditTablesState.loading = false
    auditTablesInflight = null
  })
  return auditTablesInflight
}

function ensureUsersLoaded() { return loadUsers() }
function ensureAlgorithmsLoaded() { return loadAlgorithms() }
function ensureAuditTablesLoaded() { return loadAuditTables() }
function refreshUsers() { return loadUsers(true) }
function refreshAlgorithms() { return loadAlgorithms(true) }
function refreshAuditTables() { return loadAuditTables(true) }
function ensureLoaded() { return Promise.all([ensureUsersLoaded(), ensureAlgorithmsLoaded()]).then(() => undefined) }
function refresh() { return Promise.all([refreshUsers(), refreshAlgorithms()]).then(() => undefined) }

function formatUserIdentity(identity: { userId?: string; userName?: string } | null | undefined): string {
  if (!identity) return '-'
  const id = hasText(identity.userId) ? identity.userId.trim() : ''
  const payloadName = hasText(identity.userName) ? identity.userName.trim() : ''
  const name = payloadName || (id ? usersById.value.get(id) || '' : '')
  if (id && name) return `${id} (${name})`
  if (id) return id
  return name || '-'
}

const USER_NAME_SIBLINGS: Record<string, readonly string[]> = {
  userId: ['userName'], dataOwnerId: ['dataOwnerName', 'dataOwnerUserName'], dataOwnerUserId: ['dataOwnerName', 'dataOwnerUserName'],
  initiatorId: ['initiatorName', 'initiatorUserName'], initiatorUserId: ['initiatorName', 'initiatorUserName'], ownerId: ['ownerName'],
}
function siblingName(container: Record<string, unknown> | null | undefined, key: string): string {
  const names = USER_NAME_SIBLINGS[key]
  if (!names || !container) return ''
  for (const name of names) if (hasText(container[name])) return (container[name] as string).trim()
  return ''
}
function formatUserId(id: string, hint: string) {
  const name = hint || usersById.value.get(id) || ''
  return name ? `${id} (${name})` : id
}
function formatAlgorithmId(id: string, container: Record<string, unknown> | null | undefined) {
  const hint = container && hasText(container.algorithmName) ? container.algorithmName.trim() : ''
  const name = hint || algorithmsById.value.get(id) || ''
  return name ? `${id} (${name})` : id
}
const TABLE_ID_VALUE_FIELDS: Record<string, true> = {
  tableId: true, tableIdFrom: true, tableIdTo: true, tableIds: true, allTableIds: true,
}
const formatValue: JsonValueFormatter = (key, value, container) => {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined
  const id = String(value)
  if (!id) return undefined
  if (Object.prototype.hasOwnProperty.call(TABLE_ID_VALUE_FIELDS, key)) {
    const table = auditTablesById.value.get(id)
    if (!table) return id
    const label = `${table.tableName} (${id})`
    return table.status === 'active' ? label : `${label} — ${t(`auditTables.statuses.${table.status}`)}`
  }
  if (Object.prototype.hasOwnProperty.call(USER_NAME_SIBLINGS, key)) return formatUserId(id, siblingName(container, key))
  if (key === 'userIds' || key === 'ownerIds') return formatUserId(id, '')
  if (key === 'algorithmId') return formatAlgorithmId(id, container)
  return undefined
}

export function useReferenceCatalog() {
  return {
    usersById, userEntitiesById, algorithmsById, algorithmEntitiesById, auditTables, auditTablesById,
    usersState, algorithmsState, auditTablesState,
    ensureUsersLoaded, ensureAlgorithmsLoaded, ensureAuditTablesLoaded,
    refreshUsers, refreshAlgorithms, refreshAuditTables,
    ensureLoaded, refresh, formatUserIdentity, formatValue,
  }
}
