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

const { jobStatusLabel, taskStatusLabel } = await vite.ssrLoadModule('/src/utils/statusLabels.ts')
const key = value => value

test('Job and Task status labels translate exact names and preserve unknown or absent values', () => {
  assert.equal(jobStatusLabel('Running', key), 'job.statusRunning')
  assert.equal(jobStatusLabel('Failed', key), 'job.statusFailed')
  assert.equal(jobStatusLabel('FutureStatus', key), 'FutureStatus')
  assert.equal(jobStatusLabel(null, key), 'execution.notAvailable')
  assert.equal(jobStatusLabel(undefined, key), 'execution.notAvailable')
  assert.equal(taskStatusLabel('Succeeded', key), 'execution.taskStatus.succeeded')
  assert.equal(taskStatusLabel('TimedOut', key), 'execution.taskStatus.timedOut')
  assert.equal(taskStatusLabel('FutureTaskStatus', key), 'FutureTaskStatus')
  assert.equal(taskStatusLabel('', key), 'execution.notAvailable')
})
