import client from './client'

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
}

export const createSimRequestApi = (modem_id: number, reason?: string) =>
  client.post<SimAccessRequest>('/sim-requests/', { modem_id, reason })

export const mySimRequestsApi = () =>
  client.get<SimAccessRequest[]>('/sim-requests/my')

export const listSimRequestsApi = (status?: string) =>
  client.get<SimAccessRequest[]>('/sim-requests/', { params: status ? { status } : {} })

export const approveSimRequestApi = (id: number, expires_at?: string | null, admin_note?: string) =>
  client.put(`/sim-requests/${id}/approve`, { expires_at: expires_at ?? null, admin_note })

export const rejectSimRequestApi = (id: number, admin_note?: string) =>
  client.put(`/sim-requests/${id}/reject`, { admin_note })

export const batchApproveApi = (ids: number[], expires_at?: string | null, admin_note?: string) =>
  client.post('/sim-requests/batch-approve', { ids, expires_at: expires_at ?? null, admin_note })
