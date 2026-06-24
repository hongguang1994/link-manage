import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { UserOut } from '../api/auth'

export interface EffectivePerm {
  can_view_sim: boolean
  can_approve_requests: boolean
  can_view_history: boolean
  read_only: boolean
  allowed_modem_ids: number[] | null
}

const ADMIN_PERM: EffectivePerm = {
  can_view_sim: true,
  can_approve_requests: true,
  can_view_history: true,
  read_only: false,
  allowed_modem_ids: null,
}

const NO_PERM: EffectivePerm = {
  can_view_sim: false,
  can_approve_requests: false,
  can_view_history: false,
  read_only: true,
  allowed_modem_ids: [],
}

interface AuthState {
  token: string | null
  user: UserOut | null
  setAuth: (token: string, user: UserOut) => void
  clearAuth: () => void
  perm: () => EffectivePerm
  canSupport: () => boolean
  canApprove: () => boolean
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      setAuth: (token, user) => set({ token, user }),
      clearAuth: () => set({ token: null, user: null }),
      perm: () => {
        const u = get().user
        if (!u) return NO_PERM
        if (u.role === 'admin') return ADMIN_PERM
        const roles = u.rbac_roles ?? []
        if (roles.length === 0) return NO_PERM
        const hasUnlimited = roles.some(r => r.allowed_modem_ids === null)
        const modemIds = hasUnlimited
          ? null
          : [...new Set(roles.flatMap(r => r.allowed_modem_ids ?? []))]
        return {
          can_view_sim:         roles.some(r => r.can_view_sim),
          can_approve_requests: roles.some(r => r.can_approve_requests),
          can_view_history:     roles.some(r => r.can_view_history),
          read_only:            roles.every(r => r.read_only),
          allowed_modem_ids:    modemIds,
        }
      },
      canSupport: () => {
        const u = get().user
        if (!u) return false
        if (u.role === 'admin') return true
        return (u.rbac_roles ?? []).some(r => r.can_support)
      },
      canApprove: () => {
        const u = get().user
        if (!u) return false
        if (u.role === 'admin') return true
        return (u.rbac_roles ?? []).some(r => r.can_approve_requests)
      },
    }),
    { name: 'simnexus-auth' }
  )
)
