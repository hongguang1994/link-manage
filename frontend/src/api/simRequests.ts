import client from './client'

export type PermissionLevel = 'view' | 'use'

export interface SimAccessRequest {
  id: number
  user_id: number
  username: string | null
  modem_id: number
  modem_name: string
  status: 'pending' | 'approved' | 'rejected'
  reason: string | null
  admin_note: string | null
  expires_at: string | null
  created_at: string | null
  updated_at: string | null
  is_expired: boolean
  requested_level: PermissionLevel
  granted_level: PermissionLevel | null   // from joined sim_grants, null if no grant yet
}

export interface SimGrant {
  id: number
  user_id: number
  modem_id: number
  granted_level: PermissionLevel
  expires_at: string | null
  is_expired: boolean
  created_at: string | null
}

export const createSimRequestApi = (modem_id: number, reason?: string, requested_level: PermissionLevel = 'use') =>
  client.post<SimAccessRequest>('/sim-requests/', { modem_id, reason, requested_level })

export const mySimRequestsApi = () =>
  client.get<SimAccessRequest[]>('/sim-requests/my')

export const myGrantsApi = () =>
  client.get<SimGrant[]>('/sim-requests/my-grants')

export const listSimRequestsApi = (status?: string) =>
  client.get<SimAccessRequest[]>('/sim-requests/', { params: status ? { status } : {} })

export const approveSimRequestApi = (id: number, expires_at?: string | null, admin_note?: string, granted_level: PermissionLevel = 'use') =>
  client.put(`/sim-requests/${id}/approve`, { expires_at: expires_at ?? null, admin_note, granted_level })

export const rejectSimRequestApi = (id: number, admin_note?: string) =>
  client.put(`/sim-requests/${id}/reject`, { admin_note })

export const batchApproveApi = (ids: number[], expires_at?: string | null, admin_note?: string, granted_level: PermissionLevel = 'use') =>
  client.post('/sim-requests/batch-approve', { ids, expires_at: expires_at ?? null, admin_note, granted_level })

export const revokeGrantApi = (grant_id: number) =>
  client.delete(`/sim-requests/grants/${grant_id}`)
