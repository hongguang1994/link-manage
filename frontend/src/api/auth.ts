import api from './client'

export interface PermissionOut {
  can_view_sim: boolean
  can_send_sms: boolean
  can_manage_tasks: boolean
  can_view_history: boolean
  read_only: boolean
  allowed_modem_ids: number[] | null
}

export interface UserOut {
  id: number
  username: string
  role: 'admin' | 'user'
  is_active: boolean
  created_at: string
  updated_at: string
  permission?: PermissionOut | null
}

export interface TokenResponse {
  access_token: string
  token_type: string
  user: UserOut
}

export const loginApi = (username: string, password: string) =>
  api.post<TokenResponse>('/auth/login', { username, password })

export const getMeApi = () => api.get<UserOut>('/auth/me')

export const listUsersApi = () => api.get<UserOut[]>('/users/')
export const createUserApi = (data: { username: string; password: string; role: 'admin' | 'user' }) =>
  api.post<UserOut>('/users/', data)
export const updateUserApi = (id: number, data: { role?: string; is_active?: boolean }) =>
  api.patch<UserOut>(`/users/${id}`, data)
export const deleteUserApi = (id: number) => api.delete(`/users/${id}`)
export const resetPasswordApi = (id: number, new_password: string) =>
  api.post<UserOut>(`/users/${id}/reset-password`, { new_password })
export const changePasswordApi = (old_password: string, new_password: string) =>
  api.post('/users/me/change-password', { old_password, new_password })

export const getPermissionsApi = (id: number) =>
  api.get<PermissionOut>(`/users/${id}/permissions`)
export const updatePermissionsApi = (id: number, data: PermissionOut) =>
  api.put<PermissionOut>(`/users/${id}/permissions`, data)
