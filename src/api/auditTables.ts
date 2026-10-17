import { LosslessNumber, parse as parseLossless } from 'lossless-json'
import api from './request'

export type AuditTableStatus = 'pending' | 'active' | 'invalid' | 'retired'
export type AuditTableAddressingMode = 'primaryKeyValue' | 'orderedOffset'

export interface AuditTable {
  tableId: string
  tableName: string
  status: AuditTableStatus
  addressingMode: AuditTableAddressingMode
  addressingModeLocked: boolean
  schemaRevision: string
  schemaFingerprint: string
}
export type AuditTableAddressingModeSelection = 'auto' | AuditTableAddressingMode
export interface AuditTableRegisterParams {
  tableName: string
  addressingMode?: AuditTableAddressingModeSelection
}


export interface AuditTableListResponse {
  items: AuditTable[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface AuditTableListParams {
  page?: number
  pageSize?: number
  status?: AuditTableStatus
  tableName?: string
}
function parseTableNumbers(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(parseTableNumbers)
  if (value === null || typeof value !== 'object') return value
  const result: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) {
    if ((key === 'tableId' || key === 'schemaRevision') && item instanceof LosslessNumber) {
      result[key] = item.toString()
    } else if (item instanceof LosslessNumber) {
      result[key] = item.valueOf()
    } else {
      result[key] = parseTableNumbers(item)
    }
  }
  return result
}

const losslessTableResponse = (data: unknown): unknown => {
  if (typeof data !== 'string' || data.length === 0) return data
  return parseTableNumbers(parseLossless(data, undefined, { parseNumber: value => new LosslessNumber(value) }))
}

const responseConfig = { transformResponse: [losslessTableResponse], _silent: true }

function parseSafePageNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`Invalid audit-table pagination field: ${field}`)
  }
  return value
}

const MAX_UINT64_DECIMAL = '18446744073709551615'

function isUint64Decimal(value: unknown): value is string {
  if (typeof value !== 'string' || !/^(0|[1-9]\d*)$/.test(value)) return false
  return value.length < MAX_UINT64_DECIMAL.length || (value.length === MAX_UINT64_DECIMAL.length && value <= MAX_UINT64_DECIMAL)
}
function parseAuditTable(value: unknown): AuditTable {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Invalid audit-table response')
  }
  if (
    !('tableId' in value) || !isUint64Decimal(value.tableId)
    || !('tableName' in value) || typeof value.tableName !== 'string'
    || !('schemaRevision' in value) || !isUint64Decimal(value.schemaRevision)
    || !('schemaFingerprint' in value) || typeof value.schemaFingerprint !== 'string'
  ) {
    throw new TypeError('Invalid audit-table fields')
  }
  const status = 'status' in value ? value.status : undefined
  const addressingMode = 'addressingMode' in value ? value.addressingMode : undefined
  const addressingModeLocked = 'addressingModeLocked' in value ? value.addressingModeLocked : undefined
  if (status !== 'pending' && status !== 'active' && status !== 'invalid' && status !== 'retired') {
    throw new TypeError('Invalid audit-table status')
  }
  if (addressingMode !== 'primaryKeyValue' && addressingMode !== 'orderedOffset') {
    throw new TypeError('Invalid audit-table addressing mode')
  }
  if (typeof addressingModeLocked !== 'boolean') {
    throw new TypeError('Invalid audit-table addressing mode lock')
  }
  return {
    tableId: value.tableId,
    tableName: value.tableName,
    status,
    addressingMode,
    addressingModeLocked,
    schemaRevision: value.schemaRevision,
    schemaFingerprint: value.schemaFingerprint,
  }
}

function parseAuditTablePage(value: unknown): AuditTableListResponse {
  if (value === null || typeof value !== 'object' || Array.isArray(value) || !('items' in value) || !Array.isArray(value.items)) {
    throw new TypeError('Invalid audit-table list response')
  }
  return {
    items: value.items.map(parseAuditTable),
    total: parseSafePageNumber('total' in value ? value.total : undefined, 'total'),
    page: parseSafePageNumber('page' in value ? value.page : undefined, 'page'),
    pageSize: parseSafePageNumber('pageSize' in value ? value.pageSize : undefined, 'pageSize'),
    totalPages: parseSafePageNumber('totalPages' in value ? value.totalPages : undefined, 'totalPages'),
  }
}


export async function listAuditTables(params?: AuditTableListParams): Promise<AuditTableListResponse> {
  const response: unknown = await api.get('/v1/audit-tables', { params, ...responseConfig })
  return parseAuditTablePage(response)
}

export async function getAuditTable(tableId: string): Promise<AuditTable> {
  const response: unknown = await api.get(`/v1/audit-tables/${encodeURIComponent(tableId)}`, responseConfig)
  return parseAuditTable(response)
}

export async function bootstrapAuditTables(initiatorId: string): Promise<{ jobId: string }> {
  const response = await api.post('/v1/audit-tables/bootstrap', { request: { initiatorId } }, responseConfig)
  if (response === null || typeof response !== 'object' || !('jobId' in response) || typeof response.jobId !== 'string') {
    throw new TypeError('Invalid audit-table bootstrap response')
  }
  return { jobId: response.jobId }
}

export async function registerAuditTable(params: AuditTableRegisterParams, initiatorId = '1'): Promise<AuditTable> {
  const response: unknown = await api.post('/v1/audit-tables', { request: { initiatorId }, params }, responseConfig)
  return parseAuditTable(response)
}

export async function validateAuditTable(tableId: string, initiatorId = '1'): Promise<AuditTable> {
  const response: unknown = await api.post(`/v1/audit-tables/${encodeURIComponent(tableId)}/validate`, { request: { initiatorId } }, responseConfig)
  return parseAuditTable(response)
}
export async function retireAuditTable(tableId: string, initiatorId = '1'): Promise<void> {
  await api.post(`/v1/audit-tables/${encodeURIComponent(tableId)}/retire`, { request: { initiatorId } }, responseConfig)
}
export async function updateAuditTableAddressingMode(tableId: string, addressingMode: AuditTableAddressingMode, initiatorId = '1'): Promise<AuditTable> {
  const response: unknown = await api.post(`/v1/audit-tables/${encodeURIComponent(tableId)}/addressing`, { request: { initiatorId }, params: { addressingMode } }, responseConfig)
  return parseAuditTable(response)
}
