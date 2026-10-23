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

const {
  FINGERPRINT_SHORT_HEAD,
  FINGERPRINT_SHORT_MAX,
  FINGERPRINT_SHORT_TAIL,
  auditTableAddressingNoteKey,
  auditTableCapabilities,
  auditTableStatusDescriptionKey,
  buildAuditTableLifecycle,
  buildRegistryLifecycle,
  describeSchemaFingerprint,
} = await vite.ssrLoadModule('/src/views/auditTables/auditTableModel.ts')

const FINGERPRINT_VALUE = `registry-fingerprint:${'a'.repeat(64)}`

function table(overrides = {}) {
  return {
    tableId: '7',
    tableName: 'records',
    status: 'active',
    addressingMode: 'primaryKeyValue',
    addressingModeLocked: false,
    schemaRevision: '3',
    schemaFingerprint: FINGERPRINT_VALUE,
    ...overrides,
  }
}

test('keeps the fingerprint opaque while shortening its display', () => {
  const view = describeSchemaFingerprint(FINGERPRINT_VALUE)
  assert.equal(view.raw, FINGERPRINT_VALUE)
  assert.equal(view.short, `${FINGERPRINT_VALUE.slice(0, FINGERPRINT_SHORT_HEAD)}…${FINGERPRINT_VALUE.slice(-FINGERPRINT_SHORT_TAIL)}`)
  assert.ok(view.short.length <= FINGERPRINT_SHORT_MAX)
})

test('trims only surrounding whitespace from the copied fingerprint', () => {
  const view = describeSchemaFingerprint(`  ${FINGERPRINT_VALUE}  `)
  assert.equal(view.raw, FINGERPRINT_VALUE)
})

test('does not infer an algorithm from a fingerprint prefix', () => {
  for (const value of ['SM3:abcdef', 'sha256:abcdef', 'plain-fingerprint']) {
    const view = describeSchemaFingerprint(value)
    assert.equal(view.raw, value)
    assert.ok(view.short.length <= FINGERPRINT_SHORT_MAX)
  }
})

test('treats missing fingerprints as empty without inventing content', () => {
  for (const value of [undefined, null, '', '   ', 42]) {
    assert.deepEqual(describeSchemaFingerprint(value), { raw: '', short: '' })
  }
})

test('keeps short values whole and shortens long values within the display budget', () => {
  const shortValue = describeSchemaFingerprint('short-value')
  assert.equal(shortValue.short, 'short-value')

  const longValue = describeSchemaFingerprint('b'.repeat(FINGERPRINT_SHORT_MAX + 1))
  assert.ok(longValue.short.length <= FINGERPRINT_SHORT_MAX)
  assert.ok(longValue.short.includes('…'))
  assert.ok(longValue.short.startsWith('b'.repeat(FINGERPRINT_SHORT_HEAD)))
  assert.ok(longValue.short.endsWith('b'.repeat(FINGERPRINT_SHORT_TAIL)))

  const exactlyAtBudget = describeSchemaFingerprint('b'.repeat(FINGERPRINT_SHORT_MAX))
  assert.equal(exactlyAtBudget.short, 'b'.repeat(FINGERPRINT_SHORT_MAX))
})

test('keeps addressing editable only before a lock and outside invalid or retired records', () => {
  const cases = [
    { status: 'pending', locked: false, validate: true, edit: true, retire: true },
    { status: 'pending', locked: true, validate: true, edit: false, retire: true },
    { status: 'active', locked: false, validate: true, edit: true, retire: true },
    { status: 'active', locked: true, validate: true, edit: false, retire: true },
    { status: 'invalid', locked: false, validate: true, edit: false, retire: true },
    { status: 'invalid', locked: true, validate: true, edit: false, retire: true },
    { status: 'retired', locked: false, validate: false, edit: false, retire: false },
    { status: 'retired', locked: true, validate: false, edit: false, retire: false },
  ]
  for (const entry of cases) {
    const capabilities = auditTableCapabilities({ status: entry.status, addressingModeLocked: entry.locked })
    assert.deepEqual(
      capabilities,
      { validate: entry.validate, editAddressing: entry.edit, retire: entry.retire },
      `${entry.status} locked=${entry.locked}`,
    )
  }
})

test('explains a pending mapping as registered but not yet validated', () => {
  const steps = buildAuditTableLifecycle(table({ status: 'pending' }))
  assert.deepEqual(steps.map(step => step.key), ['registration', 'schema', 'addressing', 'validation', 'retirement'])
  assert.equal(steps[0].state, 'complete')
  assert.equal(steps[1].state, 'complete')
  assert.equal(steps[1].detailParams.revision, '3')
  assert.equal(steps[2].state, 'current')
  assert.equal(steps[2].detailKey, 'auditTables.workbench.lifecycle.steps.addressing.editable')
  assert.equal(steps[2].detailParams.mode, 'primaryKeyValue')
  assert.equal(steps[3].state, 'pending')
  assert.equal(steps[3].detailKey, 'auditTables.workbench.lifecycle.steps.validation.pending')
  assert.equal(steps[4].state, 'pending')
  assert.equal(steps[4].detailKey, 'auditTables.workbench.lifecycle.steps.retirement.open')
})

test('marks a locked active mapping as settled instead of editable', () => {
  const steps = buildAuditTableLifecycle(table({ status: 'active', addressingModeLocked: true }))
  assert.equal(steps[2].state, 'complete')
  assert.equal(steps[2].detailKey, 'auditTables.workbench.lifecycle.steps.addressing.locked')
  assert.equal(steps[3].state, 'complete')
  assert.equal(steps[3].detailKey, 'auditTables.workbench.lifecycle.steps.validation.active')
  assert.equal(steps[4].state, 'pending')
})

test('marks an invalid mapping as attention with addressing blocked by the backend', () => {
  const steps = buildAuditTableLifecycle(table({ status: 'invalid' }))
  assert.equal(steps[2].state, 'blocked')
  assert.equal(steps[2].detailKey, 'auditTables.workbench.lifecycle.steps.addressing.blocked')
  assert.equal(steps[3].state, 'attention')
  assert.equal(steps[3].detailKey, 'auditTables.workbench.lifecycle.steps.validation.invalid')
  assert.equal(steps[4].state, 'pending')
})

test('marks retirement as the current terminal step and mutes upstream steps', () => {
  const steps = buildAuditTableLifecycle(table({ status: 'retired', addressingModeLocked: true }))
  assert.equal(steps[2].state, 'muted')
  assert.equal(steps[2].detailKey, 'auditTables.workbench.lifecycle.steps.addressing.retired')
  assert.equal(steps[3].state, 'muted')
  assert.equal(steps[3].detailKey, 'auditTables.workbench.lifecycle.steps.validation.retired')
  assert.equal(steps[4].state, 'current')
  assert.equal(steps[4].detailKey, 'auditTables.workbench.lifecycle.steps.retirement.retired')
})

test('explains the addressing rule with retired and invalid outranking the lock', () => {
  assert.equal(
    auditTableAddressingNoteKey({ status: 'retired', addressingModeLocked: false }),
    'auditTables.workbench.addressing.retired',
  )
  assert.equal(
    auditTableAddressingNoteKey({ status: 'invalid', addressingModeLocked: true }),
    'auditTables.workbench.addressing.invalid',
  )
  assert.equal(
    auditTableAddressingNoteKey({ status: 'active', addressingModeLocked: true }),
    'auditTables.addressingModeLocked',
  )
  assert.equal(
    auditTableAddressingNoteKey({ status: 'pending', addressingModeLocked: false }),
    'auditTables.addressingModeEditable',
  )
})

test('maps every registry status to its own explanation key', () => {
  for (const status of ['pending', 'active', 'invalid', 'retired']) {
    assert.equal(auditTableStatusDescriptionKey(status), `auditTables.workbench.detail.stateDescriptions.${status}`)
  }
})

test('advances the registry lifecycle only on facts the page already holds', () => {
  assert.deepEqual(
    buildRegistryLifecycle({ registryState: 'unknown', bootstrapJobActive: false }),
    [
      { key: 'uninitialized', state: 'unknown' },
      { key: 'bootstrapping', state: 'unknown' },
      { key: 'ready', state: 'unknown' },
    ],
  )
  assert.deepEqual(
    buildRegistryLifecycle({ registryState: 'uninitialized', bootstrapJobActive: false }),
    [
      { key: 'uninitialized', state: 'current' },
      { key: 'bootstrapping', state: 'pending' },
      { key: 'ready', state: 'pending' },
    ],
  )
  assert.deepEqual(
    buildRegistryLifecycle({ registryState: 'uninitialized', bootstrapJobActive: true }),
    [
      { key: 'uninitialized', state: 'complete' },
      { key: 'bootstrapping', state: 'current' },
      { key: 'ready', state: 'pending' },
    ],
  )
})

test('a published registry outranks a stale running bootstrap snapshot', () => {
  assert.deepEqual(
    buildRegistryLifecycle({ registryState: 'initialized', bootstrapJobActive: true }),
    [
      { key: 'uninitialized', state: 'complete' },
      { key: 'bootstrapping', state: 'complete' },
      { key: 'ready', state: 'current' },
    ],
  )
})

test('does not mark the registry ready when bootstrap ends before a readable list confirms it', () => {
  const stages = buildRegistryLifecycle({ registryState: 'unknown', bootstrapJobActive: false })
  assert.equal(stages.find(stage => stage.key === 'ready')?.state, 'unknown')
})
