import type { PageRequest, PageResponse } from './pagination'
import api from './request'

export interface User {
  userId: string
  userName: string
  createdAtMs: number
  updatedAtMs: number
}

export type UserListResponse = PageResponse<User>

// GET /api/v1/users
export function getUsers(params?: PageRequest): Promise<UserListResponse> {
  return api.get('/v1/users', { params })
}

// GET /api/v1/users/{userId}
export function getUserDetail(userId: string) {
  return api.get(`/v1/users/${encodeURIComponent(userId)}`)
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
  return api.patch(`/v1/users/${encodeURIComponent(userId)}`, {
    request: { initiatorId: initiatorId || '1' },
    params: { name },
  })
}

// DELETE /api/v1/users/{userId}
export function deleteUser(userId: string, initiatorId?: string) {
  return api.delete(`/v1/users/${encodeURIComponent(userId)}`, {
    data: {
      request: { initiatorId: initiatorId || '1' },
    },
  })
}
