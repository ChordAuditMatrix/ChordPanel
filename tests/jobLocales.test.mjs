import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { resolve } from 'node:path'
import { createServer } from 'vite'

const root = process.cwd()
const vite = await createServer({
  configFile: false,
  root,
  resolve: { alias: [{ find: '@', replacement: resolve(root, 'src') }] },
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, hmr: false, ws: false },
  appType: 'custom',
  logLevel: 'silent',
})

after(async () => { await vite.close() })

const zhCN = (await vite.ssrLoadModule('/src/locales/zh-CN.ts')).default
const en = (await vite.ssrLoadModule('/src/locales/en.ts')).default

const visibleJobKeys = [
  'job.title', 'job.filterStatus', 'job.filterType', 'job.filterOwnerId',
  'job.detail', 'job.detailJob', 'job.taskId', 'job.type', 'job.status',
  'job.initiator', 'job.dataOwner', 'job.parentJob', 'job.durationMs', 'job.createdAt',
  'job.message', 'job.errorCode', 'job.resultSummary', 'job.subtasks', 'job.noSubtasks',
  'job.statusHistory', 'job.cancelJob', 'job.taskDetail', 'job.jobId', 'job.taskType',
  'job.taskSubType', 'job.priority', 'job.submittedAt', 'job.startedAt', 'job.completedAt',
  'job.actions', 'job.statusPending', 'job.statusRunning', 'job.statusSucceeded',
  'job.statusFailed', 'job.statusRecovering', 'job.typeAudit', 'job.typeQuery',
  'job.typeStorage', 'job.typeReplication', 'job.loadDetailFailed', 'job.loadTasksFailed',
  'job.openExecution', 'job.workbench.eyebrow', 'job.workbench.pageDescription',
  'job.workbench.statScope', 'job.workbench.statUnavailable', 'job.workbench.statFilteredNote',
  'job.workbench.statTotal', 'job.workbench.statRunning', 'job.workbench.statSucceeded',
  'job.workbench.statFailed', 'job.workbench.listTitle', 'job.workbench.listDescription',
  'job.workbench.resetFilters', 'job.workbench.loadFailed', 'job.workbench.lastLoaded',
  'job.workbench.scopeNote', 'job.workbench.operationLabel', 'job.workbench.operationUnknown',
  'job.workbench.operationAbsent', 'job.workbench.operation.tagGeneration',
  'job.workbench.operation.regeneration', 'job.workbench.operation.challengeProof',
  'job.workbench.operation.identityVerification', 'job.workbench.operation.maintenance',
  'job.workbench.businessObject', 'job.workbench.noBusinessObject',
  'job.workbench.object.tables', 'job.workbench.object.tableFrom', 'job.workbench.object.tableTo',
  'job.workbench.object.row', 'job.workbench.object.rowFrom', 'job.workbench.object.rowTo',
  'job.workbench.object.column', 'job.workbench.object.algorithm', 'job.workbench.object.scope',
  'job.workbench.object.operationId', 'job.workbench.object.auditTableOperation',
  'job.workbench.object.maintenanceJob', 'job.workbench.unknown', 'job.workbench.recordedProgress',
  'job.workbench.error', 'job.workbench.noError', 'job.workbench.noHistory',
  'job.workbench.rawMetadataLabel', 'job.workbench.statusScopeNote', 'job.workbench.openTask',
  'job.workbench.statusMessageFull',
  'job.workbench.action.execution', 'job.workbench.action.executionHelp',
  'job.workbench.action.details', 'job.workbench.action.detailsHelp',
  'job.workbench.action.report', 'job.workbench.action.reportHelp',
  'job.workbench.errorCode.Cancelled', 'job.workbench.errorCode.InternalError',
  'job.workbench.errorCode.Timeout', 'job.workbench.errorCode.NotFound',
  'job.workbench.errorCode.InvalidInput',
  'job.workbench.global.drawerTitle', 'job.workbench.global.emptyDescription',
  'job.workbench.global.openJobCenter', 'job.workbench.global.typePending',
  'job.workbench.verification', 'job.workbench.verificationTrue',
  'job.workbench.verificationFalse', 'job.workbench.verificationUnknown',
  'jobProgress.title', 'jobProgress.titleWithRunningCount',
  'jobProgress.runningCountAnnouncement', 'jobProgress.noRunningAnnouncement',
  'jobProgress.empty', 'jobProgress.clearCompleted', 'jobProgress.createdAt', 'jobProgress.duration',
  'jobProgress.remove',
]

function getByPath(object, path) {
  return path.split('.').reduce((value, part) => value?.[part], object)
}

function flattenKeys(object, prefix = '') {
  return Object.entries(object).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key
    return value && typeof value === 'object' ? flattenKeys(value, path) : [path]
  })
}

test('Job page and async progress keys resolve to translated copy in both locales', () => {
  for (const [locale, messages] of [['zh-CN', zhCN], ['en', en]]) {
    for (const key of visibleJobKeys) {
      const value = getByPath(messages, key)
      assert.equal(typeof value, 'string', `${locale} is missing ${key}`)
      assert.notEqual(value, key, `${locale} displays the raw key ${key}`)
    }
  }
})

test('Job and async progress locale trees have matching keys', () => {
  for (const namespace of ['job', 'jobProgress']) {
    assert.deepEqual(
      flattenKeys(zhCN[namespace]).sort(),
      flattenKeys(en[namespace]).sort(),
      `${namespace} locale keys must match`,
    )
  }
})
