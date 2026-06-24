import api from './client'

export interface SupportMessage {
  id: number
  user_id: number
  sender_id: number
  sender_name: string
  content: string
  is_from_user: boolean
  is_read: boolean
  created_at: string
  attachment_url?: string | null
  attachment_name?: string | null
  attachment_type?: string | null
}

export interface Conversation {
  user_id: number
  username: string
  last_message: string
  last_at: string
  unread_count: number
}

export interface SendPayload {
  content?: string
  user_id?: number
  attachment_url?: string
  attachment_name?: string
  attachment_type?: string
}

export const uploadFileApi = (file: File) => {
  const fd = new FormData()
  fd.append('file', file)
  return api.post<{ url: string; name: string; type: string }>('/support/upload', fd)
}

export const sendMessageApi = (payload: SendPayload) =>
  api.post<SupportMessage>('/support/messages', payload)

export const getMessagesApi = (user_id?: number, since_id?: number) =>
  api.get<SupportMessage[]>('/support/messages', { params: { user_id, since_id } })

export const markReadApi = (user_id?: number) =>
  api.post('/support/messages/read', null, { params: { user_id } })

export const getUnreadApi = () =>
  api.get<{ count: number }>('/support/unread')

export const getConversationsApi = () =>
  api.get<Conversation[]>('/support/conversations')
