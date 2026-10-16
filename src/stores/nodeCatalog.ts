import { ref } from 'vue'
import { fetchAllPages, type PageResponse } from '@/api/pagination'
import { getNodes, type NodeSummary } from '@/api/system'

const PAGE_SIZE = 1000
const TTL_MS = 60_000
const nodes = ref<NodeSummary[]>([])
const loading = ref(false)
const error = ref<unknown>(null)
let loaded = false
let loadedAt = 0
let inflight: Promise<void> | null = null

function readPage(value: unknown): PageResponse<NodeSummary> {
  if (value === null || typeof value !== 'object' || Array.isArray(value) || !('items' in value) || !Array.isArray(value.items)) {
    throw new TypeError('Invalid node list response')
  }
  const rawItems: unknown[] = value.items
  const items = rawItems.filter((item): item is NodeSummary =>
    item !== null && typeof item === 'object' && 'nodeId' in item && typeof item.nodeId === 'string')
  if (items.length !== rawItems.length) throw new TypeError('Invalid node summary')
  return {
    items,
    total: 'total' in value && typeof value.total === 'number' ? value.total : items.length,
    page: 'page' in value && typeof value.page === 'number' ? value.page : 1,
    pageSize: 'pageSize' in value && typeof value.pageSize === 'number' ? value.pageSize : PAGE_SIZE,
    totalPages: 'totalPages' in value && typeof value.totalPages === 'number' ? value.totalPages : 0,
  }
}

function loadNodes(force = false): Promise<void> {
  if (inflight) return inflight
  if (loaded && !force) return Promise.resolve()
  loading.value = true
  error.value = null
  const current = fetchAllPages(async params => readPage(await getNodes(params)), PAGE_SIZE)
    .then(items => {
      nodes.value = items
      loaded = true
      loadedAt = Date.now()
    })
    .catch(reason => {
      error.value = reason
    })
    .finally(() => {
      loading.value = false
      if (inflight === current) inflight = null
    })
  inflight = current
  return current
}

export function useNodeCatalog() {
  return {
    nodes,
    loading,
    error,
    ensureNodesLoaded: () => loadNodes(loaded && Date.now() - loadedAt >= TTL_MS),
  }
}
