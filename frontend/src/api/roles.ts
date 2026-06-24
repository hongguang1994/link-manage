import api from './client'
import type { RoleOut } from './auth'

export type { RoleOut }

export interface RoleCreate {
  name: string
  description?: string
  can_view_sim: boolean
  can_approve_requests: boolean
  can_view_history: boolean
  read_only: boolean
  can_support: boolean
  allowed_modem_ids?: number[] | null
}

export const listRolesApi = () => api.get<RoleOut[]>('/roles/')
export const createRoleApi = (data: RoleCreate) => api.post<RoleOut>('/roles/', data)
export const updateRoleApi = (id: number, data: Partial<RoleCreate>) => api.patch<RoleOut>(`/roles/${id}`, data)
export const deleteRoleApi = (id: number) => api.delete(`/roles/${id}`)
export const setUserRolesApi = (userId: number, roleIds: number[]) =>
  api.put(`/roles/users/${userId}/roles`, { role_ids: roleIds })
