import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer } from 'vite'

const vite = await createServer({
  configFile: false,
  root: process.cwd(),
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, hmr: false, ws: false },
  appType: 'custom',
  logLevel: 'silent',
})

try {
  const { projectAuditSubmissionSummary } = await vite.ssrLoadModule('/src/views/audit/auditSubmissionSummary.ts')

  function summary(jobId, kind, references = {}, progress = {}, workerStages = null) {
    return {
      jobId,
      executionKind: kind,
      references: { verified: null, ...references },
      progress: {
        plannedPartCount: null,
        completedPartCount: null,
        plannedBlockCount: null,
        generatedBlockCount: null,
        storageAccountedTagCount: null,
        persistedCount: null,
        duplicateCount: null,
        replacedCount: null,
        ...progress,
      },
      coverage: { workerStages },
    }
  }

  test('Challenge summary uses only the matching Trace verdict and preserves false versus unknown', () => {
    assert.equal(
      projectAuditSubmissionSummary('job-1', 'challengeProof', summary('job-1', 'challengeProof', { verified: true })).verificationVerdict,
      true,
    )
    assert.equal(
      projectAuditSubmissionSummary('job-1', 'challengeProof', summary('job-1', 'challengeProof', { verified: false })).verificationVerdict,
      false,
    )
    assert.equal(
      projectAuditSubmissionSummary('job-1', 'challengeProof', summary('job-1', 'challengeProof', { verified: null })).verificationVerdict,
      null,
    )
    assert.equal(projectAuditSubmissionSummary('job-1', 'challengeProof', summary('other-job', 'challengeProof', { verified: true })), null)
    assert.equal(projectAuditSubmissionSummary('job-1', 'challengeProof', summary('job-1', 'tagGeneration', { verified: true })), null)
  })

  test('Tag summary retains exact available counts and does not reinterpret verification fields', () => {
    const result = projectAuditSubmissionSummary('job-1', 'tagGeneration', summary(
      'job-1',
      'tagGeneration',
      { verified: true },
      { plannedPartCount: '0', completedPartCount: '2', plannedBlockCount: '20', generatedBlockCount: '19', persistedCount: '5', storageAccountedTagCount: '1' },
      'partial',
    ))
    assert.deepEqual(result.tagProgress, [
      { key: 'plannedPartCount', value: '0' },
      { key: 'completedPartCount', value: '2' },
      { key: 'plannedBlockCount', value: '20' },
      { key: 'generatedBlockCount', value: '19' },
      { key: 'persistedCount', value: '5' },
      { key: 'storageAccountedTagCount', value: '1' },
    ])
    assert.equal(result.verificationVerdict, null)
    assert.equal(result.workerStageCoverage, 'partial')
  })

  test('Missing Trace counters and coverage remain absent', () => {
    const result = projectAuditSubmissionSummary('job-1', 'tagGeneration', summary('job-1', 'tagGeneration'))
    assert.deepEqual(result, {
      workerStageCoverage: null,
      verificationVerdict: null,
      tagProgress: [],
    })
  })
} finally {
  await vite.close()
}
