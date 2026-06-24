import api from './client'

export interface UserOut {
  id: number
  username: string
  role: 'admin' | 'user'
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface TokenResponse {
  access_token: string
  token_type: string
  user: UserOut
}

export const loginApi = (username: string, password: string) =>
  api.post<TokenResponse>('/auth/login', { username, password })

export const getMeApi = () => api.get<UserOut>('/auth/me')

// User management (admin only)
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
