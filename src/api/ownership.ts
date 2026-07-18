import api from './request'

export interface MembershipProofRequest {
  proofType: 'membership' | 'non-membership'
  ownerId: string
  tableId: number
  rowId: number
  columnId: number
}

export interface RangeProofRequest {
  ownerId: string
  tableIdFrom: number
  tableIdTo: number
  rowIdFrom: number
  rowIdTo: number
}

// Generate single proof (membership / non-membership)
export function generateProof(data: MembershipProofRequest, initiatorId = '1') {
  return api.post('/v1/ownership/proof/generate', {
    request: { initiatorId },
    params: data,
  })
}

// Verify single proof
export function verifyProof(proofType: string, proof: Record<string, unknown>, initiatorId = '1') {
  return api.post('/v1/ownership/proof/verify', {
    request: { initiatorId },
    params: { proofType, proof },
  })
}

// Generate range proof
export function generateRangeProof(data: RangeProofRequest, initiatorId = '1') {
  return api.post('/v1/ownership/proof/range/generate', {
    request: { initiatorId },
    params: data,
  })
}

// Verify range proof
export function verifyRangeProof(proof: Record<string, unknown>, initiatorId = '1') {
  return api.post('/v1/ownership/proof/range/verify', {
    request: { initiatorId },
    params: { proof },
  })
}

// ── Ownership add/remove management ──

export interface DataCell {
  tableId: number
  rowId: number
  columnId: number
}

// Add ownership
export function addCells(ownerId: string, cells: DataCell[], initiatorId = '1') {
  return api.post('/v1/ownership/cells', {
    request: { initiatorId },
    params: { ownerId, cells },
  })
}

// Remove ownership
export function removeCells(ownerId: string, cells: DataCell[], initiatorId = '1') {
  return api.delete('/v1/ownership/cells', {
    data: {
      request: { initiatorId },
      params: { ownerId, cells },
    },
  })
}

// Move ownership
export function moveCells(sourceOwnerId: string, targetOwnerId: string, cells: DataCell[], initiatorId = '1') {
  return api.post('/v1/ownership/cells/move', {
    request: { initiatorId },
    params: { sourceOwnerId, targetOwnerId, cells },
  })
}

// Query ownership
export function queryCells(ownerId: string, params?: { tableId?: number; rowId?: number; columnId?: number; dataOwnerId?: string }) {
  return api.get('/v1/ownership/cells/query', { params: { ownerId, ...params } })
}

// Create tree
export function createTree(ownerId: string, initiatorId = '1') {
  return api.post('/v1/ownership/tree', {
    request: { initiatorId },
    params: { ownerId },
  })
}

// Delete tree
export function deleteTree(ownerId: string, initiatorId = '1') {
  return api.delete('/v1/ownership/tree', {
    data: {
      request: { initiatorId },
      params: { ownerId },
    },
  })
}

// Batch import ownership
export function importCells(ownerId: string, cells: Array<{ tableId: number; rowId: number; columnId: number }>, overwrite = false, initiatorId = '1') {
  return api.post('/v1/ownership/import', {
    request: { initiatorId },
    params: { ownerId, cells, overwrite },
  })
}

export interface OwnershipExportFilter {
  tableIdFrom?: number
  tableIdTo?: number
  rowIdFrom?: number
  rowIdTo?: number
}

// Batch export ownership
export function exportCells(ownerId: string, filter?: OwnershipExportFilter, initiatorId = '1') {
  return api.post('/v1/ownership/export', {
    request: { initiatorId },
    params: { ownerId, filter: filter || {} },
  })
}

// Verify single cell ownership
export function verifyOwnershipCell(ownerId: string, cell: { tableId: number; rowId: number; columnId: number }, initiatorId = '1') {
  return api.post('/v1/ownership/cells/verify', {
    request: { initiatorId },
    params: { ownerId, cell },
  })
}

// Batch query Merkle tree nodes
export function findNodesByIds(nodeIds: string[], initiatorId = '1') {
  return api.post('/v1/ownership/nodes/batch-query', {
    request: { initiatorId },
    params: { nodeIds },
  })
}

// Batch delete Merkle tree nodes
export function deleteNodes(nodeIds: string[], initiatorId = '1') {
  return api.delete('/v1/ownership/nodes:batchDelete', {
    data: {
      request: { initiatorId },
      params: { nodeIds },
    },
  })
}
