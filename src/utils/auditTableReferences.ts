const TABLE_ID_FIELDS: Record<string, true> = { tableId: true, tableIdFrom: true, tableIdTo: true }
const TABLE_ID_ARRAY_FIELDS: Record<string, true> = { tableIds: true, allTableIds: true }

export function hasAuditTableReference(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasAuditTableReference)
  if (!value || typeof value !== 'object') return false
  return Object.entries(value).some(([key, item]) => {
    if (Object.prototype.hasOwnProperty.call(TABLE_ID_FIELDS, key) && (typeof item === 'string' || typeof item === 'number')) return true
    if (Object.prototype.hasOwnProperty.call(TABLE_ID_ARRAY_FIELDS, key) && Array.isArray(item) && item.length > 0) return true
    return hasAuditTableReference(item)
  })
}
