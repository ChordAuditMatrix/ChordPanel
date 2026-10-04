import { ref } from 'vue'
import { getUsers } from '@/api/user'
import { getProfiles } from '@/api/algorithm'
import type { JsonValueFormatter } from '@/components/JsonKeyValue.vue'

/**
 * Shared identity catalog — module-scope singleton (same convention as
 * stores/settings.ts and stores/jobTracking.ts, no extra Pinia store).
 *
 * Resolves user/algorithm IDs to their payload-provided names at render time.
 * The catalogs are read-only lookups: DTOs, request bodies and JSON copy/export
 * are never mutated. An unresolved ID always keeps its full raw value.
 */


const PAGE_SIZE = 1000

const usersById = ref<Map<string, string>>(new Map())
const algorithmsById = ref<Map<string, string>>(new Map())
let usersLoaded = false
let algorithmsLoaded = false
let inflight: Promise<void> | null = null

function hasText(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0
}

interface PageEnvelope {
  items: unknown[]
  total: number
  totalPages: number
}

/** Read one `items,total,page,pageSize,totalPages` page envelope defensively. */
function readEnvelope(res: unknown): PageEnvelope {
  if (!res || typeof res !== 'object') return { items: [], total: 0, totalPages: 0 }
  const items: unknown[] = 'items' in res && Array.isArray(res.items) ? res.items : []
  const total = 'total' in res && typeof res.total === 'number' ? res.total : 0
  const totalPages = 'totalPages' in res && typeof res.totalPages === 'number' ? res.totalPages : 0
  return { items, total, totalPages }
}

/** Fetch the first page, then every remaining page declared by its envelope. */
async function loadCatalogEntries(
  fetcher: (params: { page: number; pageSize: number }) => Promise<unknown>,
  select: (item: unknown) => { id: string; name: string } | null,
): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  const addItems = (items: unknown[]) => {
    for (const item of items) {
      const entry = select(item)
      if (entry) map.set(entry.id, entry.name)
    }
  }

  const first = readEnvelope(await fetcher({ page: 1, pageSize: PAGE_SIZE }))
  addItems(first.items)

  const totalPages = first.totalPages > 0
    ? first.totalPages
    : first.total > 0
      ? Math.ceil(first.total / PAGE_SIZE)
      : first.items.length ? 1 : 0

  for (let page = 2; page <= totalPages; page++) {
    const { items } = readEnvelope(await fetcher({ page, pageSize: PAGE_SIZE }))
    if (!items.length) break
    addItems(items)
  }
  return map
}

function selectUserIdName(item: unknown): { id: string; name: string } | null {
  if (!item || typeof item !== 'object' || !('userId' in item) || !hasText(item.userId)) return null
  const name = 'userName' in item ? item.userName : undefined
  return { id: item.userId.trim(), name: hasText(name) ? name.trim() : '' }
}

function selectAlgorithmIdName(item: unknown): { id: string; name: string } | null {
  if (!item || typeof item !== 'object' || !('algorithmId' in item) || !hasText(item.algorithmId)) return null
  const name = 'algorithmName' in item ? item.algorithmName : undefined
  return { id: item.algorithmId.trim(), name: hasText(name) ? name.trim() : '' }
}

/**
 * Load both catalogs. Each source is all-or-nothing: a failed source keeps its
 * previous (possibly empty) snapshot and never rejects, so identity lookup can
 * never block primary Job/Task data. The API interceptor still surfaces the
 * error through the existing error UI.
 */
async function loadCatalog(): Promise<void> {
  const [usersResult, algorithmsResult] = await Promise.allSettled([
    loadCatalogEntries((params) => getUsers(params), selectUserIdName),
    loadCatalogEntries((params) => getProfiles(params), selectAlgorithmIdName),
  ])

  if (usersResult.status === 'fulfilled') {
    usersById.value = usersResult.value
    usersLoaded = true
  } else {
    console.error('[identityCatalog] failed to load users', usersResult.reason)
  }

  if (algorithmsResult.status === 'fulfilled') {
    algorithmsById.value = algorithmsResult.value
    algorithmsLoaded = true
  } else {
    console.error('[identityCatalog] failed to load algorithm profiles', algorithmsResult.reason)
  }
}

function startLoad(): Promise<void> {
  if (!inflight) {
    inflight = loadCatalog().finally(() => { inflight = null })
  }
  return inflight
}

/** Deduped load; no-op once both catalogs are available. */
function ensureLoaded(): Promise<void> {
  if (usersLoaded && algorithmsLoaded) return Promise.resolve()
  return startLoad()
}

/** Explicit UI refresh: reloads catalogs, deduped while a load is in flight. */
function refresh(): Promise<void> {
  usersLoaded = false
  algorithmsLoaded = false
  return startLoad()
}

/** Payload name first, then catalog by exact User ID; otherwise the raw ID. */
function formatUserIdentity(identity: { userId?: string; userName?: string } | null | undefined): string {
  if (!identity) return '-'
  const id = hasText(identity.userId) ? identity.userId.trim() : ''
  const payloadName = hasText(identity.userName) ? identity.userName.trim() : ''
  const name = payloadName || (id ? usersById.value.get(id) || '' : '')
  if (id && name) return `${id} (${name})`
  if (id) return id
  return name || '-'
}

// Only these exact keys are identity scalars — never jobId/taskId/nodeId/...
const USER_NAME_SIBLINGS: Record<string, readonly string[]> = {
  userId: ['userName'],
  dataOwnerId: ['dataOwnerName', 'dataOwnerUserName'],
  dataOwnerUserId: ['dataOwnerName', 'dataOwnerUserName'],
  initiatorId: ['initiatorName', 'initiatorUserName'],
  initiatorUserId: ['initiatorName', 'initiatorUserName'],
  ownerId: ['ownerName'],
}

function siblingName(container: Record<string, unknown> | null | undefined, key: string): string {
  const candidates = USER_NAME_SIBLINGS[key]
  if (!candidates || !container) return ''
  for (const candidate of candidates) {
    const value = container[candidate]
    if (hasText(value)) return value.trim()
  }
  return ''
}

function formatUserId(id: string, nameHint: string): string {
  const name = nameHint || usersById.value.get(id) || ''
  return name ? `${id} (${name})` : id
}

function formatAlgorithmId(id: string, container: Record<string, unknown> | null | undefined): string {
  const hint = container && hasText(container.algorithmName) ? container.algorithmName.trim() : ''
  const name = hint || algorithmsById.value.get(id) || ''
  return name ? `${id} (${name})` : id
}

/**
 * Pure formatter: `undefined` for non-identity keys/objects, otherwise the raw
 * ID decorated with a payload/catalog name when one is known.
 */
const formatValue: JsonValueFormatter = (key, value, container) => {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined
  const id = String(value)
  if (!id) return undefined

  if (Object.prototype.hasOwnProperty.call(USER_NAME_SIBLINGS, key)) {
    return formatUserId(id, siblingName(container, key))
  }
  if (key === 'userIds' || key === 'ownerIds') {
    return formatUserId(id, '')
  }
  if (key === 'algorithmId') {
    return formatAlgorithmId(id, container)
  }
  return undefined
}

export function useIdentityCatalog() {
  return { ensureLoaded, refresh, formatUserIdentity, formatValue }
}
