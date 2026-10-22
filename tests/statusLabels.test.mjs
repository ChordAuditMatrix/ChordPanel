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

const { maintenanceRecoveryLabel } = await vite.ssrLoadModule('/src/utils/statusLabels.ts')
const key = value => value

test('maintenance recovery keeps explicit states, empty completion and unknown phases distinct', () => {
  assert.equal(maintenanceRecoveryLabel('Requested', key), 'execution.maintenance.states.requested')
  assert.equal(maintenanceRecoveryLabel('RecoveryBlocked', key), 'execution.maintenance.states.recoveryBlocked')
  assert.equal(maintenanceRecoveryLabel('CleanupPending', key), 'execution.maintenance.states.cleanupPending')
  assert.equal(maintenanceRecoveryLabel('Unknown', key), 'execution.maintenance.states.unknown')
  assert.equal(maintenanceRecoveryLabel('', key), 'execution.maintenance.noRecovery')
  assert.equal(maintenanceRecoveryLabel('RegistryRollbackApplying', key), 'RegistryRollbackApplying')
  assert.equal(maintenanceRecoveryLabel(null, key), 'execution.notAvailable')
  assert.equal(maintenanceRecoveryLabel(undefined, key), 'execution.notAvailable')
})
