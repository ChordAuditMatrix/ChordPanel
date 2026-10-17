import { LosslessNumber, parse as parseLossless, stringify as stringifyLossless } from 'lossless-json'
import api from './request'

type Uint64 = string | number
const UINT64_MAX = 18_446_744_073_709_551_615n

function uint64Text(value: unknown): string {
  if (value instanceof LosslessNumber) return value.toString()
  if (typeof value === 'string') return value
  return typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : ''
}

function exactUint64(value: unknown): LosslessNumber {
  const text = uint64Text(value)
  if (!/^(0|[1-9]\d*)$/.test(text) || BigInt(text) > UINT64_MAX) throw new TypeError('Ownership tableId must be an exact uint64 decimal value')
  return new LosslessNumber(text)
}

function tryUint64(value: unknown): LosslessNumber | null {
  const text = uint64Text(value)
  return /^(0|[1-9]\d*)$/.test(text) && BigInt(text) <= UINT64_MAX ? new LosslessNumber(text) : null
}

function normalizeOwnershipResponse(value: unknown, key = '', inTableIds = false): unknown {
  if (value instanceof LosslessNumber) {
    if (key === 'tableId' || key === 'tableIdFrom' || key === 'tableIdTo' || inTableIds) return value.toString()
    if (key === 'rowId' || key === 'rowIdFrom' || key === 'rowIdTo') throw new TypeError('Ownership row IDs must be JSON strings')
    const number = value.valueOf()
    return typeof number === 'bigint' ? number.toString() : number
  }
  if (Array.isArray(value)) return value.map(item => normalizeOwnershipResponse(item, '', inTableIds))
  if (!value || typeof value !== 'object') return value
  const normalized: Record<string, unknown> = {}
  for (const [childKey, childValue] of Object.entries(value)) {
    normalized[childKey] = normalizeOwnershipResponse(childValue, childKey, childKey === 'tableIds' || childKey === 'allTableIds')
  }
  return normalized
}

function parseOwnershipResponse(data: unknown): unknown {
  if (typeof data !== 'string' || data.length === 0) return data
  return normalizeOwnershipResponse(parseLossless(data, undefined, { parseNumber: value => new LosslessNumber(value) }))
}
export function parseOwnershipJson(text: string): unknown {
  return parseLossless(text, undefined, { parseNumber: value => new LosslessNumber(value) })
}

const ownershipResponseConfig = { transformResponse: [parseOwnershipResponse] }
const losslessNumberStringifier = [{ test: (value: unknown) => value instanceof LosslessNumber, stringify: (value: unknown) => (value as LosslessNumber).toString() }]

const ownershipRequestConfig = {
  ...ownershipResponseConfig,
  transformRequest: [(data: unknown) => stringifyLossless(data, (key, value) => {
    if (key === 'tableIds' || key === 'allTableIds') {
      return Array.isArray(value) ? value.map(exactUint64) : value
    }
    return key === 'tableId' || key === 'tableIdFrom' || key === 'tableIdTo' ? exactUint64(value) : value
  }, undefined, losslessNumberStringifier)],
}

const proofRequestConfig = {
  ...ownershipResponseConfig,
  transformRequest: [(data: unknown) => stringifyLossless(data, (key, value) => {
    if (key === 'tableIds' || key === 'allTableIds') {
      return Array.isArray(value) ? value.map(item => tryUint64(item) ?? item) : value
    }
    if (key !== 'tableId' && key !== 'tableIdFrom' && key !== 'tableIdTo') return value
    return tryUint64(value) ?? value
  }, undefined, losslessNumberStringifier)],
}

export interface MembershipProofRequest {
  proofType: 'membership' | 'non-membership'
  ownerId: string
  tableId: Uint64
  rowId: string
  columnId: number
}

export interface RangeProofRequest {
  ownerId: string
  tableIdFrom: Uint64
  tableIdTo: Uint64
  rowIdFrom: string
  rowIdTo: string
}

export function generateProof(data: MembershipProofRequest, initiatorId = '1') {
  return api.post('/v1/ownership/proof/generate', { request: { initiatorId }, params: data }, ownershipRequestConfig)
}

export function verifyProof(proofType: string, proof: Record<string, unknown>, initiatorId = '1') {
  return api.post('/v1/ownership/proof/verify', { request: { initiatorId }, params: { proofType, proof } }, proofRequestConfig)
}

export function generateRangeProof(data: RangeProofRequest, initiatorId = '1') {
  return api.post('/v1/ownership/proof/range/generate', { request: { initiatorId }, params: data }, ownershipRequestConfig)
}

export function verifyRangeProof(proof: Record<string, unknown>, initiatorId = '1') {
  return api.post('/v1/ownership/proof/range/verify', { request: { initiatorId }, params: { proof } }, proofRequestConfig)
}

export interface DataCell {
  tableId: Uint64
  rowId: string
  columnId: number
}

export function addCells(ownerId: string, cells: DataCell[], initiatorId = '1') {
  return api.post('/v1/ownership/cells', { request: { initiatorId }, params: { ownerId, cells } }, ownershipRequestConfig)
}

export function removeCells(ownerId: string, cells: DataCell[], initiatorId = '1') {
  return api.delete('/v1/ownership/cells', { data: { request: { initiatorId }, params: { ownerId, cells } }, ...ownershipRequestConfig })
}

export function moveCells(sourceOwnerId: string, targetOwnerId: string, cells: DataCell[], initiatorId = '1') {
  return api.post('/v1/ownership/cells/move', { request: { initiatorId }, params: { sourceOwnerId, targetOwnerId, cells } }, ownershipRequestConfig)
}

export function queryCells(ownerId: string, params?: { tableId?: Uint64; rowId?: string; columnId?: number; dataOwnerId?: string }) {
  const tableId = params?.tableId === undefined ? undefined : exactUint64(params.tableId).toString()
  return api.get('/v1/ownership/cells/query', { params: { ownerId, ...params, ...(tableId === undefined ? {} : { tableId }) }, ...ownershipResponseConfig })
}

export function createTree(ownerId: string, initiatorId = '1') {
  return api.post('/v1/ownership/tree', { request: { initiatorId }, params: { ownerId } }, ownershipResponseConfig)
}

export function deleteTree(ownerId: string, initiatorId = '1') {
  return api.delete('/v1/ownership/tree', { data: { request: { initiatorId }, params: { ownerId } }, ...ownershipResponseConfig })
}

export interface OwnershipImportCell {
  tableId: Uint64 | LosslessNumber
  rowId: string
  columnId: number | LosslessNumber
}

export function importCells(ownerId: string, cells: OwnershipImportCell[], overwrite = false, initiatorId = '1') {
  return api.post('/v1/ownership/import', { request: { initiatorId }, params: { ownerId, cells, overwrite } }, ownershipRequestConfig)
}

export interface OwnershipExportFilter {
  tableIdFrom?: Uint64
  tableIdTo?: Uint64
  rowIdFrom?: string
  rowIdTo?: string
}

export function exportCells(ownerId: string, filter?: OwnershipExportFilter, initiatorId = '1') {
  return api.post('/v1/ownership/export', { request: { initiatorId }, params: { ownerId, filter: filter || {} } }, ownershipRequestConfig)
}

export function verifyOwnershipCell(ownerId: string, cell: { tableId: Uint64; rowId: string; columnId: number }, initiatorId = '1') {
  return api.post('/v1/ownership/cells/verify', { request: { initiatorId }, params: { ownerId, cell } }, ownershipRequestConfig)
}

export function findNodesByIds(nodeIds: string[], initiatorId = '1') {
  return api.post('/v1/ownership/nodes/batch-query', { request: { initiatorId }, params: { nodeIds } }, ownershipResponseConfig)
}

export function deleteNodes(nodeIds: string[], initiatorId = '1') {
  return api.delete('/v1/ownership/nodes:batchDelete', { data: { request: { initiatorId }, params: { nodeIds } }, ...ownershipResponseConfig })
}
