import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createSSRApp, h } from 'vue'
import { renderToString } from '@vue/server-renderer'
import vue from '@vitejs/plugin-vue'
import { createProjectVite } from './shared/viteHarness.mjs'
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: { getItem: () => null, setItem: () => {} },
})

const vite = await createProjectVite({ plugins: [vue()] })
after(async () => { await vite.close() })

const { default: TagPartMatrix } = await vite.ssrLoadModule('/src/features/execution/components/TagPartMatrix.vue')

test('a complete empty Part read renders the no-parts state', async () => {
  const app = createSSRApp({
    render: () => h(TagPartMatrix, {
      parts: [],
      summary: null,
      tasks: [],
      pageCoverage: {},
      windowLoading: {},
      windowErrors: {},
      loadPartWindows: async () => {},
      partsComplete: true,
      partsTotal: 0,
    }),
  })

  app.component('n-tag', { render: () => h('span') })
  app.component('n-button', { render: () => h('button') })

  const html = await renderToString(app)

  assert.match(html, /暂无分片任务记录/)
  assert.doesNotMatch(html, /分片仍有未加载的页/)
})
