import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { resolve } from 'node:path'
import { createServer } from 'vite'

const root = process.cwd()
const requestPublicId = 'virtual:job-api-test-request'
const requestId = '\0job-api-test-request'

const requestStub = {
  name: 'job-api-test-request-stub',
  enforce: 'pre',
  resolveId(id) {
    if (id === requestPublicId || id === './request') return requestId
  },
  load(id) {
    if (id === requestId) {
      return `
export const requests = []
const api = {
  get(url, config) {
    requests.push({ url, config })
    if (url.endsWith('/tasks')) {
      return Promise.resolve({
        items: [],
        total: 0,
        page: config?.params?.page ?? 1,
        pageSize: config?.params?.pageSize ?? 20,
        totalPages: 0,
      })
    }
    return Promise.resolve({
      jobId: 'job-1',
      jobType: 'Audit',
      status: 'Running',
      createdAtMs: 1,
      taskIdsComplete: true,
    })
  },
}
export default api
`
    }
  },
}

const vite = await createServer({
  configFile: false,
  root,
  plugins: [requestStub],
  resolve: { alias: [{ find: '@', replacement: resolve(root, 'src') }] },
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, hmr: false, ws: false },
  appType: 'custom',
  logLevel: 'silent',
})

after(async () => { await vite.close() })

const job = await vite.ssrLoadModule('/src/api/job.ts')
const requestModule = await vite.ssrLoadModule(requestPublicId)

test('Job and Task loads keep the global modal path by default', async () => {
  await job.getJobDetail('job-1')
  let request = requestModule.requests.at(-1)
  assert.equal(request.config._silent, undefined)

  await job.getJobTasks('job-1', { page: 1, pageSize: 10 })
  request = requestModule.requests.at(-1)
  assert.equal(request.config._silent, undefined)
})

test('Job and Task loads carry the silent transport flag without dropping other config', async () => {
  await job.getJobDetail('job/1', { silent: true })
  let request = requestModule.requests.at(-1)
  assert.equal(request.url, '/v1/jobs/job%2F1')
  assert.equal(request.config._silent, true)
  assert.equal(typeof request.config.transformResponse?.[0], 'function')

  const params = { page: 2, pageSize: 5, sortBy: 'submittedAtMs', ascending: true }
  await job.getJobTasks('job-1', params, { silent: true })
  request = requestModule.requests.at(-1)
  assert.equal(request.url, '/v1/jobs/job-1/tasks')
  assert.equal(request.config._silent, true)
  assert.deepEqual(request.config.params, params)
  assert.equal(typeof request.config.transformResponse?.[0], 'function')
})
