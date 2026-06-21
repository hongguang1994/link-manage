import api from './client'

export interface Modem {
  id: number
  device_path: string
  mm_object_path: string | null
  imei: string | null
  manufacturer: string | null
  model: string | null
  phone_number: string | null
  operator: string | null
  signal_quality: number
  status: 'connected' | 'disconnected' | 'error' | 'unknown'
  alias: string | null
  is_active: boolean
  last_seen: string | null
  created_at: string
}

export const getModemsApi = () => api.get<Modem[]>('/modems/')
export const updateModemApi = (id: number, data: { alias?: string }) => api.patch<Modem>(`/modems/${id}`, data)
export const refreshModemApi = (id: number) => api.post<Modem>(`/modems/${id}/refresh`)
