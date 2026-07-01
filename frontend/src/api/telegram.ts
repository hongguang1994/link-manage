import api from './client'

export interface TelegramMessage {
  id: number
  chat_id: string
  username: string | null
  direction: 'in' | 'out'
  text: string
  created_at: string
  is_command: boolean
  file_id: string | null
  file_type: string | null
}

export interface TelegramConfig {
  bot_token_set: boolean
  chat_id: string
  polling: boolean
}

export const getTelegramMessagesApi = (skip = 0, limit = 100) =>
  api.get<TelegramMessage[]>('/telegram/messages', { params: { skip, limit } })

export const sendTelegramMessageApi = (text: string, chat_id?: string) =>
  api.post('/telegram/send', { text, chat_id })

export const clearTelegramMessagesApi = () =>
  api.delete('/telegram/messages')

export const sendTelegramFileApi = (file: File, caption?: string) => {
  const form = new FormData()
  form.append('file', file)
  if (caption) form.append('caption', caption)
  return api.post('/telegram/send-file', form)
}

export const getTelegramConfigApi = () =>
  api.get<TelegramConfig>('/telegram/config')
