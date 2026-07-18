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
          path: 'jobs',
          name: 'jobs',
          component: () => import('@/views/job/JobView.vue'),
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
