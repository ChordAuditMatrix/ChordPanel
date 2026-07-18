import api from './request'

export interface User {
  userId: string
  userName: string
  createdAtMs: number
  updatedAtMs: number
}

export interface UserListResponse {
  items: User[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

// GET /api/v1/users
export function getUsers(params?: { page?: number; pageSize?: number }) {
  return api.get('/v1/users', { params })
}

// GET /api/v1/users/{userId}
export function getUserDetail(userId: string) {
  return api.get(`/v1/users/${userId}`)
}

// POST /api/v1/users
export function createUser(name: string, initiatorId?: string) {
  return api.post('/v1/users', {
    request: { initiatorId: initiatorId || '1' },
    params: { name },
  })
}

// PATCH /api/v1/users/{userId}
export function renameUser(userId: string, name: string, initiatorId?: string) {
  return api.patch(`/v1/users/${userId}`, {
    request: { initiatorId: initiatorId || '1' },
    params: { name },
  })
}

// DELETE /api/v1/users/{userId}
export function deleteUser(userId: string, initiatorId?: string) {
  return api.delete(`/v1/users/${userId}`, {
    data: {
      request: { initiatorId: initiatorId || '1' },
    },
  })
}
