import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import ts from 'typescript'

const root = process.cwd()

function moduleUrl(code) {
  return `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
}

async function loadTypeScriptModule(relativePath, stubRequest = false) {
  const source = readFileSync(resolve(root, relativePath), 'utf8')
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText
  if (!stubRequest) return import(moduleUrl(code))

  const requestStub = `
globalThis.__algorithmWorkbenchApiCalls = []
const calls = globalThis.__algorithmWorkbenchApiCalls
const api = Object.fromEntries(['get', 'post', 'delete'].map(method => [
  method,
  (...args) => { calls.push([method, ...args]); return Promise.resolve({}) },
]))
export default api
`
  const requestUrl = moduleUrl(requestStub)
  const apiCode = code
    .replace('from "./request"', `from "${requestUrl}"`)
    .replace("from './request'", `from '${requestUrl}'`)
  assert.notEqual(apiCode, code, 'the Algorithm API request transport is replaced by the test stub')
  return import(moduleUrl(apiCode))
}

const {
  classifyStrategyKind,
  countProfilesByType,
  decodeCapabilityMask,
  describeProfileVersions,
  describeStrategy,
  filterStrategies,
  findStrategyByType,
  jobsForProfile,
  resolveStrategyCapabilities,
} = await loadTypeScriptModule('src/views/algorithm/algorithmWorkbench.ts')

// Strategy/profile fixtures reflect the extended fields modeled by the current
// frontend contract; the published RESTFUL_API.md strategy sample is obsolete.
function sm9Static(overrides = {}) {
  return {
    algorithmType: 'SM9Static',
    version: '1.0.0',
    purpose: 'Audit',
    strategyKind: 'Static',
    capabilities: ['IdentityAuthentication'],
    capabilitiesMask: 2,
    stateMaintenanceParty: null,
    ...overrides,
  }
}

function dhtDynamic(overrides = {}) {
  return {
    algorithmType: 'DHTDynamic',
    version: '1.1.0',
    purpose: 'Audit',
    strategyKind: 'Dynamic',
    capabilities: ['IdentityAuthentication', 'DynamicUpdate'],
    capabilitiesMask: 6,
    stateMaintenanceParty: 'TPA',
    ...overrides,
  }
}

function identityType(overrides = {}) {
  return {
    algorithmType: 'SM2Identity',
    version: '2.1.0',
    purpose: 'Identity',
    strategyKind: 'Offline',
    capabilities: null,
    capabilitiesMask: null,
    stateMaintenanceParty: null,
    ...overrides,
  }
}

function profile(overrides = {}) {
  return {
    algorithmId: 'algorithm-1',
    algorithmType: 'SM9Static',
    algorithmName: 'audit-static',
    version: 3,
    purpose: 'Audit',
    ...overrides,
  }
}

test('decodeCapabilityMask reports null for missing or malformed masks', () => {
  for (const value of [null, undefined, '2', 2.5, -1, Number.NaN, Number.POSITIVE_INFINITY, 0x1_0000_0000]) {
    assert.deepEqual(decodeCapabilityMask(value), { mask: null, names: [], unnamedBits: [] })
  }
})

test('decodeCapabilityMask distinguishes a reported zero from an unreported mask', () => {
  assert.deepEqual(decodeCapabilityMask(0), { mask: 0, names: [], unnamedBits: [] })
})

test('decodeCapabilityMask names documented bits in ascending order', () => {
  assert.deepEqual(decodeCapabilityMask(2), { mask: 2, names: ['IdentityAuthentication'], unnamedBits: [] })
  assert.deepEqual(decodeCapabilityMask(6), { mask: 6, names: ['IdentityAuthentication', 'DynamicUpdate'], unnamedBits: [] })
  assert.deepEqual(decodeCapabilityMask(7), {
    mask: 7,
    names: ['BatchVerify', 'IdentityAuthentication', 'DynamicUpdate'],
    unnamedBits: [],
  })
})

test('decodeCapabilityMask keeps undocumented bits instead of inventing names', () => {
  assert.deepEqual(decodeCapabilityMask(8), { mask: 8, names: [], unnamedBits: [8] })
  assert.deepEqual(decodeCapabilityMask(14), { mask: 14, names: ['IdentityAuthentication', 'DynamicUpdate'], unnamedBits: [8] })
  const highBit = decodeCapabilityMask(0x80000001)
  assert.deepEqual(highBit.names, ['BatchVerify'])
  assert.deepEqual(highBit.unnamedBits, [0x80000000])
})

test('resolveStrategyCapabilities keeps a missing mask unknown', () => {
  assert.deepEqual(resolveStrategyCapabilities({ capabilitiesMask: null, capabilities: null }), {
    state: 'unknown',
    mask: null,
    names: [],
    unnamedBits: [],
  })
})

test('resolveStrategyCapabilities treats reported zero and an empty list as explicit zero', () => {
  assert.deepEqual(resolveStrategyCapabilities({ capabilitiesMask: 0, capabilities: [] }), {
    state: 'none',
    mask: 0,
    names: [],
    unnamedBits: [],
  })
  assert.deepEqual(resolveStrategyCapabilities({ capabilitiesMask: null, capabilities: [] }), {
    state: 'none',
    mask: null,
    names: [],
    unnamedBits: [],
  })
})

test('resolveStrategyCapabilities surfaces names without a mask as declared', () => {
  assert.deepEqual(resolveStrategyCapabilities({ capabilitiesMask: null, capabilities: ['BatchVerify'] }), {
    state: 'declared',
    mask: null,
    names: ['BatchVerify'],
    unnamedBits: [],
  })
})

test('resolveStrategyCapabilities unions mask names and reported names', () => {
  const fact = resolveStrategyCapabilities({ capabilitiesMask: 2, capabilities: ['BatchVerify'] })
  assert.equal(fact.state, 'declared')
  assert.deepEqual(fact.names, ['IdentityAuthentication', 'BatchVerify'])
})

test('resolveStrategyCapabilities reports unnamed bits next to declared names', () => {
  const fact = resolveStrategyCapabilities({ capabilitiesMask: 6, capabilities: ['IdentityAuthentication', 'DynamicUpdate'] })
  assert.deepEqual(fact.unnamedBits, [])
  assert.equal(fact.state, 'declared')
  const withExtraBit = resolveStrategyCapabilities({ capabilitiesMask: 6 | 8, capabilities: ['IdentityAuthentication', 'DynamicUpdate'] })
  assert.deepEqual(withExtraBit.unnamedBits, [8])
})

test('classifyStrategyKind uses the purpose taxonomy and never guesses', () => {
  assert.deepEqual(classifyStrategyKind('Audit', 'Static'), { raw: 'Static', axis: 'audit', kind: 'Static' })
  assert.deepEqual(classifyStrategyKind('Audit', 'Dynamic'), { raw: 'Dynamic', axis: 'audit', kind: 'Dynamic' })
  assert.deepEqual(classifyStrategyKind('Identity', 'Online'), { raw: 'Online', axis: 'identity', kind: 'Online' })
  assert.deepEqual(classifyStrategyKind('Identity', 'Offline'), { raw: 'Offline', axis: 'identity', kind: 'Offline' })
})

test('classifyStrategyKind keeps mismatched or missing kinds unknown', () => {
  assert.deepEqual(classifyStrategyKind('Identity', 'Static'), { raw: 'Static', axis: 'unknown', kind: null })
  assert.deepEqual(classifyStrategyKind('Audit', 'Online'), { raw: 'Online', axis: 'unknown', kind: null })
  assert.deepEqual(classifyStrategyKind('Audit', 'static'), { raw: 'static', axis: 'unknown', kind: null })
  assert.deepEqual(classifyStrategyKind(null, 'Static'), { raw: 'Static', axis: 'unknown', kind: null })
  assert.deepEqual(classifyStrategyKind('Audit', ''), { raw: null, axis: 'unknown', kind: null })
  assert.deepEqual(classifyStrategyKind('Audit', null), { raw: null, axis: 'unknown', kind: null })
})

test('describeStrategy keeps the plugin version a string and decodes audit capabilities', () => {
  const view = describeStrategy(sm9Static())
  assert.equal(view.pluginVersion, '1.0.0')
  assert.equal(view.kind.kind, 'Static')
  assert.equal(view.capabilities.state, 'declared')
  assert.deepEqual(view.capabilities.names, ['IdentityAuthentication'])
  assert.equal(view.capabilities.mask, 2)
  assert.equal(view.maintenanceParty, null)
  assert.equal(view.maintenancePartyApplies, false)
})

test('describeStrategy shows a maintenance party only for Dynamic audit strategies', () => {
  const view = describeStrategy(dhtDynamic())
  assert.equal(view.kind.kind, 'Dynamic')
  assert.equal(view.maintenanceParty, 'TPA')
  assert.equal(view.maintenancePartyApplies, true)

  const missingParty = describeStrategy(dhtDynamic({ stateMaintenanceParty: null }))
  assert.equal(missingParty.maintenanceParty, null)
  assert.equal(missingParty.maintenancePartyApplies, true)

  const staticWithParty = describeStrategy(sm9Static({ stateMaintenanceParty: 'CSP' }))
  assert.equal(staticWithParty.maintenanceParty, null)
  assert.equal(staticWithParty.maintenancePartyApplies, false)
})

test('strategy capability declarations match the documented strategy examples', () => {
  const staticCapabilities = describeStrategy(sm9Static()).capabilities
  const dynamicCapabilities = describeStrategy(dhtDynamic()).capabilities
  const identityCapabilities = describeStrategy(identityType()).capabilities

  assert.deepEqual(staticCapabilities.names, ['IdentityAuthentication'])
  assert.deepEqual(dynamicCapabilities.names, ['IdentityAuthentication', 'DynamicUpdate'])
  assert.equal(dynamicCapabilities.names.includes('BatchVerify'), false)
  assert.deepEqual(identityCapabilities, {
    state: 'unknown',
    mask: null,
    names: [],
    unnamedBits: [],
  })
})

test('describeStrategy keeps identity Online/Offline from the reported kind', () => {
  const online = describeStrategy(identityType({ strategyKind: 'Online' }))
  assert.equal(online.kind.axis, 'identity')
  assert.equal(online.kind.kind, 'Online')
  assert.equal(online.capabilities.state, 'unknown')
  assert.equal(online.maintenancePartyApplies, false)

  const offline = describeStrategy(identityType())
  assert.equal(offline.kind.kind, 'Offline')
  assert.equal(offline.capabilities.mask, null)
})

test('describeStrategy never coerces a non-string plugin version', () => {
  assert.equal(describeStrategy(sm9Static({ version: 1 })).pluginVersion, null)
  assert.equal(describeStrategy(sm9Static({ version: '' })).pluginVersion, null)
  assert.equal(describeStrategy(sm9Static({ version: '  ' })).pluginVersion, null)
})

test('describeProfileVersions keeps profile and plugin versions separate', () => {
  assert.deepEqual(describeProfileVersions(3, '1.0.0'), { profileVersion: 3, pluginVersion: '1.0.0' })
  assert.deepEqual(describeProfileVersions(0, '1.0.0'), { profileVersion: 0, pluginVersion: '1.0.0' })
  assert.deepEqual(describeProfileVersions('3', '1.0.0'), { profileVersion: null, pluginVersion: '1.0.0' })
  assert.deepEqual(describeProfileVersions(3, 1), { profileVersion: 3, pluginVersion: null })
  assert.deepEqual(describeProfileVersions(undefined, undefined), { profileVersion: null, pluginVersion: null })
})

test('countProfilesByType counts only complete, unfiltered coverage', () => {
  const profiles = [
    profile(),
    profile({ algorithmId: 'algorithm-2', algorithmName: 'audit-2' }),
    profile({ algorithmId: 'algorithm-3', algorithmType: 'SM2Identity', algorithmName: 'identity-1', purpose: 'Identity', version: 1 }),
  ]
  const counts = countProfilesByType(profiles, 3)
  assert.ok(counts)
  assert.equal(counts.get('SM9Static'), 2)
  assert.equal(counts.get('SM2Identity'), 1)
  assert.equal(countProfilesByType(profiles, 4), null, 'partial page must not produce counts')
  assert.equal(countProfilesByType(profiles, 2), null, 'over-complete data must not produce counts')
  assert.equal(countProfilesByType([profiles[0], profiles[0], profiles[2]], 3), null, 'duplicate IDs cannot establish complete coverage')
  assert.equal(countProfilesByType([profile({ algorithmType: '' })], 1), null, 'missing type data must not produce a zero count')
  assert.equal(countProfilesByType(profiles, null), null)
  assert.equal(countProfilesByType(profiles, -1), null)
  assert.equal(countProfilesByType([], 0)?.size, 0, 'zero profiles is a complete empty set')
})

test('findStrategyByType matches the exact type only', () => {
  const strategies = [sm9Static(), dhtDynamic(), identityType()]
  assert.equal(findStrategyByType(strategies, 'DHTDynamic')?.algorithmType, 'DHTDynamic')
  assert.equal(findStrategyByType(strategies, 'sm9static'), null)
  assert.equal(findStrategyByType(strategies, 'Missing'), null)
  assert.equal(findStrategyByType(strategies, null), null)
  assert.equal(findStrategyByType(strategies, ''), null)
})

test('filterStrategies narrows by purpose and case-insensitive query', () => {
  const strategies = [sm9Static(), dhtDynamic(), identityType()]
  assert.deepEqual(filterStrategies(strategies).map(item => item.algorithmType), ['SM9Static', 'DHTDynamic', 'SM2Identity'])
  assert.deepEqual(filterStrategies(strategies, { purpose: 'Identity' }).map(item => item.algorithmType), ['SM2Identity'])
  assert.deepEqual(filterStrategies(strategies, { purpose: 'Audit', query: 'dht' }).map(item => item.algorithmType), ['DHTDynamic'])
  assert.deepEqual(filterStrategies(strategies, { query: '  sm2  ' }).map(item => item.algorithmType), ['SM2Identity'])
  assert.deepEqual(filterStrategies(strategies, { purpose: 'Unknown' }), [])
})
test('purpose filtering keeps capability facts attached to each strategy', () => {
  const strategies = [sm9Static(), dhtDynamic(), identityType()]
  const auditViews = filterStrategies(strategies, { purpose: 'Audit' }).map(describeStrategy)
  const identityViews = filterStrategies(strategies, { purpose: 'Identity' }).map(describeStrategy)

  assert.deepEqual(auditViews.map(view => view.capabilities.names), [
    ['IdentityAuthentication'],
    ['IdentityAuthentication', 'DynamicUpdate'],
  ])
  assert.deepEqual(identityViews.map(view => view.capabilities), [{
    state: 'unknown',
    mask: null,
    names: [],
    unnamedBits: [],
  }])
})
test('profile job projection links only jobs returned for the exact profile ID', () => {
  const jobs = [
    { jobId: 'job-init-a', algorithmId: 'algorithm-a', kind: 'init', recordedAtMs: 10 },
    { jobId: 'job-bind-a', algorithmId: 'algorithm-a', kind: 'bind', recordedAtMs: 20 },
    { jobId: 'job-init-b', algorithmId: 'algorithm-b', kind: 'init', recordedAtMs: 30 },
  ]

  assert.deepEqual(jobsForProfile(jobs, 'algorithm-a').map(job => job.jobId), ['job-bind-a', 'job-init-a'])
  assert.deepEqual(jobsForProfile(jobs, 'algorithm-b').map(job => job.jobId), ['job-init-b'])
  assert.deepEqual(jobsForProfile(jobs, null), [])
})
const algorithmApi = await loadTypeScriptModule('src/api/algorithm.ts', true)

test('algorithm API methods preserve the strategy, profile, owner binding, and operation routes', async () => {
  globalThis.__algorithmWorkbenchApiCalls.length = 0
  await algorithmApi.getStrategies({ page: 2, pageSize: 1000 })
  await algorithmApi.getProfiles({ page: 1, pageSize: 20, type: 'SM9Static', purpose: 'Audit' })
  await algorithmApi.initProfile('SM9Static', 'audit-profile', { mode: 'safe' }, 'owner-1')
  await algorithmApi.deinitProfile('algorithm-1', 'owner-1')
  await algorithmApi.bindUser('algorithm-1', 'user-1', 'owner-1')
  await algorithmApi.unbindUser('algorithm-1', 'user-1')
  await algorithmApi.listProfileBindings('algorithm-1', { page: 1, pageSize: 10 })
  await algorithmApi.getBindings({ algorithmId: 'algorithm-1', userId: 'user-1' })

  assert.deepEqual(globalThis.__algorithmWorkbenchApiCalls, [
    ['get', '/v1/algorithms/strategies', { params: { page: 2, pageSize: 1000 } }],
    ['get', '/v1/algorithms/profiles', { params: { page: 1, pageSize: 20, type: 'SM9Static', purpose: 'Audit' } }],
    ['post', '/v1/algorithms/profiles', {
      request: { initiatorId: 'owner-1', algorithmType: 'SM9Static', algorithmName: 'audit-profile' },
      params: { mode: 'safe' },
    }],
    ['post', '/v1/algorithms/profiles/algorithm-1/deinitialize', { request: { initiatorId: 'owner-1' } }],
    ['post', '/v1/algorithms/profiles/algorithm-1/bindings', { request: { initiatorId: 'owner-1' }, params: { userId: 'user-1' } }],
    ['delete', '/v1/algorithms/profiles/algorithm-1/bindings/user-1'],
    ['get', '/v1/algorithms/profiles/algorithm-1/bindings', { params: { page: 1, pageSize: 10 } }],
    ['get', '/v1/algorithms/bindings', { params: { algorithmId: 'algorithm-1', userId: 'user-1' } }],
  ])
})
