export function hasAlgorithmIdReference(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasAlgorithmIdReference)
  if (!value || typeof value !== 'object') return false

  return Object.entries(value).some(([key, item]) => {
    if (
      key === 'algorithmId'
      && (typeof item === 'number' || (typeof item === 'string' && item.trim().length > 0))
    ) return true
    return hasAlgorithmIdReference(item)
  })
}
