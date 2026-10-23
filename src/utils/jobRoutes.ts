export function executionRoute(jobId: string) {
  return { name: 'executionDetail', params: { jobId } } as const
}

export function reportRoute(jobId: string) {
  return { name: 'executionReport', params: { jobId } } as const
}

export function jobCenterRoute(jobId?: string) {
  return jobId ? { name: 'jobs', query: { jobId } } as const : { name: 'jobs' } as const
}
