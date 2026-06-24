import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { UserOut, PermissionOut } from '../api/auth'

const FULL_PERM: PermissionOut = {
  can_view_sim: true, can_send_sms: true,
  can_manage_tasks: true, can_view_history: true,
  read_only: false, allowed_modem_ids: null,
}

interface AuthState {
  token: string | null
  user: UserOut | null
  setAuth: (token: string, user: UserOut) => void
  clearAuth: () => void
  perm: () => PermissionOut
  canSupport: () => boolean
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
        if (!u) return FULL_PERM
        if (u.role === 'admin') return FULL_PERM
        const roles = u.rbac_roles ?? []
        if (roles.length > 0) {
          // Device scope: unrestricted if any role has null; else union of IDs
          const hasUnlimited = roles.some(r => r.allowed_modem_ids === null)
          const modemIds = hasUnlimited
            ? null
            : [...new Set(roles.flatMap(r => r.allowed_modem_ids ?? []))]
          return {
            can_view_sim:      roles.some(r => r.can_view_sim),
            can_send_sms:      roles.some(r => r.can_send_sms),
            can_manage_tasks:  roles.some(r => r.can_manage_tasks),
            can_view_history:  roles.some(r => r.can_view_history),
            read_only:         roles.every(r => r.read_only),
            allowed_modem_ids: modemIds,
          }
        }
        return u.permission ?? FULL_PERM
      },
      canSupport: () => {
        const u = get().user
        if (!u) return false
        if (u.role === 'admin') return true
        return (u.rbac_roles ?? []).some(r => r.can_support)
      },
    }),
    { name: 'simnexus-auth' }
  )
)
