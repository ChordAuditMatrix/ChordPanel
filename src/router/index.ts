import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      component: () => import('@/layout/AppLayout.vue'),
      children: [
        {
          path: '',
          name: 'dashboard',
          component: () => import('@/views/dashboard/DashboardView.vue'),
        },
        {
          path: 'users',
          name: 'users',
          component: () => import('@/views/user/UserView.vue'),
        },
        {
          path: 'nodes',
          name: 'nodes',
          component: () => import('@/views/node/NodeView.vue'),
        },
        {
          path: 'algorithms',
          name: 'algorithms',
          component: () => import('@/views/algorithm/AlgorithmView.vue'),
        },
        {
          path: 'audit-tables',
          name: 'auditTables',
          component: () => import('@/views/auditTables/AuditTablesView.vue'),
        },
        {
          path: 'jobs',
          name: 'jobs',
          component: () => import('@/views/job/JobView.vue'),
        },
        // Execution pages are reached from a Job row, not from the sidebar.
        // Their titles/groups come from route meta so the topbar can name them.
        {
          path: 'executions/:jobId',
          name: 'executionDetail',
          component: () => import('@/views/execution/ExecutionView.vue'),
          meta: { titleKey: 'execution.title', groupKey: 'job.title' },
        },
        {
          path: 'executions/:jobId/report',
          name: 'executionReport',
          component: () => import('@/views/execution/ExecutionReportView.vue'),
          meta: { titleKey: 'execution.reportTitle', groupKey: 'job.title' },
        },
        {
          path: 'audit',
          name: 'audit',
          component: () => import('@/views/audit/AuditView.vue'),
        },
        {
          path: 'ownership',
          name: 'ownership',
          component: () => import('@/views/ownership/OwnershipView.vue'),
        },
        {
          path: 'identity',
          name: 'identity',
          component: () => import('@/views/identity/IdentityView.vue'),
        },
        {
          path: 'events',
          name: 'events',
          component: () => import('@/views/event/EventView.vue'),
        },
      ],
    },
  ],
})

export default router
