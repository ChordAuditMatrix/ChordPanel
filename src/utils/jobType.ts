const jobTypeTranslationKeys: Record<string, string> = {
  Audit: 'job.typeAudit',
  Query: 'job.typeQuery',
  Storage: 'job.typeStorage',
  Replication: 'job.typeReplication',
}

export function jobTypeLabel(jobType: string, translate: (key: string) => string): string {
  const key = jobTypeTranslationKeys[jobType]
  return key ? translate(key) : jobType
}
