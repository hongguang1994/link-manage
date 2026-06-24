import api from './client'

export interface Modem {
  id: number
  device_path: string | null
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
  access_technologies: string | null
  registration_state: string | null
  tx_bytes: number | null
  rx_bytes: number | null
  connection_duration: number | null
}

export interface ModemDetail extends Modem {
  sms_sent: number
  sms_received: number
  sms_today: number
}

export const getModemsApi = () => api.get<Modem[]>('/modems/')
export const getModemDetailApi = (id: number) => api.get<ModemDetail>(`/modems/${id}/detail`)
export const updateModemApi = (id: number, data: { alias?: string }) => api.patch<Modem>(`/modems/${id}`, data)
export const refreshModemApi = (id: number) => api.post<Modem>(`/modems/${id}/refresh`)
