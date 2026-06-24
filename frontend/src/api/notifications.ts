import api from './client'

export interface AppNotification {
  id: number
  type: string
  title: string
  body: string
  is_read: boolean
  created_at: string
}

export const getNotificationsApi = () =>
  api.get<AppNotification[]>('/notifications')

export const getUnreadCountApi = () =>
  api.get<{ count: number }>('/notifications/unread-count')

export const markAllReadApi = () =>
  api.post('/notifications/read-all')

export const markOneReadApi = (id: number) =>
  api.post(`/notifications/${id}/read`)
