/**
 * QA-only Summary envelope for a Job whose Summary was never captured.
 *
 * By default, unknown Job facts remain null. Explicit visual contexts set only
 * the fields needed by their QA surface; none of them becomes a backend fact.
 */

/**
 * @param {string} jobId
 * @param {{
 *   syntheticIdentityScope?: 'cell' | 'row' | 'table',
 *   syntheticIdentitySummary?: true,
 *   syntheticChallengeRunning?: true,
 *   syntheticTagGenerationProgress?: true,
 * }} [visualContext]
 */
export function buildDerivedSummaryEnvelope(jobId, visualContext = {}) {
  const envelope = {
    schemaVersion: 1,
    executionTraceId: `job:${jobId}`,
    jobId,
    executionKind: null,
    job: {
      status: null,
      errorCode: null,
      createdAtMs: null,
      endedAtMs: null,
    },
    references: {
      owner: null,
      initiator: null,
      algorithmId: null,
      tableId: null,
      storageNodeId: null,
      verifyType: null,
      rowId: null,
      columnId: null,
      verified: null,
      rootHashPresent: null,
      ownerCount: null,
      ownerRootHashCount: null,
    },
    progress: {
      plannedPartCount: null,
      completedPartCount: null,
      plannedBlockCount: null,
      generatedBlockCount: null,
      storageAccountedTagCount: null,
      persistedCount: null,
      duplicateCount: null,
      replacedCount: null,
    },
    coverage: {
      job: null,
      tasks: null,
      parts: null,
      protocol: null,
      workerStages: null,
      reasons: [],
    },
    observedAtMs: null,
    /** QA-only marker: this envelope is not a recorded backend response. */
    qaDerivedSummary: true,
  }

  if (visualContext.syntheticIdentityScope !== undefined) {
    if (!['cell', 'row', 'table'].includes(visualContext.syntheticIdentityScope)) {
      throw new Error(`Invalid synthetic identity scope: ${visualContext.syntheticIdentityScope}`)
    }
    envelope.executionKind = 'identityVerification'
    envelope.references.verifyType = visualContext.syntheticIdentityScope
  }
  if (visualContext.syntheticIdentitySummary === true) {
    envelope.executionKind = 'identityVerification'
    envelope.job.status = 'Succeeded'
    envelope.references.verifyType = 'cell'
    envelope.references.owner = {
      userId: '11111111-1111-4111-8111-111111111111',
      userName: 'QA Data Owner',
      nameSource: 'qaSynthetic',
    }
    envelope.references.initiator = {
      userId: '1',
      userName: 'QA Operator',
      nameSource: 'qaSynthetic',
    }
    envelope.references.rootHashPresent = true
    envelope.references.ownerCount = '1'
    envelope.references.ownerRootHashCount = '1'
    envelope.coverage.workerStages = 'complete'
  }
  if (visualContext.syntheticChallengeRunning === true) {
    envelope.executionKind = 'challengeProof'
    envelope.job.status = 'Running'
  }
  if (visualContext.syntheticTagGenerationProgress === true) {
    envelope.executionKind = 'tagGeneration'
    envelope.job.status = 'Running'
    envelope.progress.plannedBlockCount = '4'
    envelope.progress.generatedBlockCount = '3'
    envelope.progress.storageAccountedTagCount = '1'
  }

  return envelope
}
