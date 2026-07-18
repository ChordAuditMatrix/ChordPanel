import api from './request'

export interface IdentityVerifyResult {
  jobId: string
  taskId: string
  status: string
  detail: string
}

// Verify cell identity signature
export function verifyCell(tableId: string, rowId: string, columnId: string) {
  return api.post('/identity/verify/cell', { tableId, rowId, columnId })
}

// Verify row identity signature
export function verifyRow(tableId: string, rowId: string) {
  return api.post('/identity/verify/row', { tableId, rowId })
}

// Verify table identity signature
export function verifyTable(tableId: string) {
  return api.post('/identity/verify/table', { tableId })
}

// Manually trigger root hash re-signing
export function resign(ownerId: string, algorithmId: string, algorithmType: string) {
  return api.post('/identity/resign', { ownerId, algorithmId, algorithmType })
}
