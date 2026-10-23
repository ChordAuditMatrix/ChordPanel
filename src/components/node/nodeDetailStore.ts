import { getNodeDetail } from '@/api/system'
import { createNodeDetailLoader } from './nodeDetailCache'

/**
 * Shared across NodeDetailModal instances and route visits: opening a node
 * reuses the last parsed detail for a short TTL, then refreshes in place.
 */
export const nodeDetailLoader = createNodeDetailLoader(nodeId => getNodeDetail(nodeId))
