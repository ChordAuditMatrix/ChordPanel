export type JobStatusTagType = 'default' | 'info' | 'success' | 'warning' | 'error'

export function jobStatusTagType(status: string | null | undefined): JobStatusTagType {
  const normalized = status?.toLowerCase()
  if (normalized === 'succeeded' || normalized === 'completed') return 'success'
  if (normalized === 'running') return 'info'
  if (normalized === 'failed') return 'error'
  if (normalized === 'canceled' || normalized === 'cancelled' || normalized === 'rejected') return 'warning'
  return 'default'
}
