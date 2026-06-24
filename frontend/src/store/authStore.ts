import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { UserOut, PermissionOut } from '../api/auth'

// Full-access permissions (used for admin)
const FULL_PERM: PermissionOut = {
  can_view_sim: true,
  can_send_sms: true,
  can_manage_tasks: true,
  can_view_history: true,
  read_only: false,
  allowed_modem_ids: null,
}

interface AuthState {
  token: string | null
  user: UserOut | null
  setAuth: (token: string, user: UserOut) => void
  clearAuth: () => void
  // Resolved permissions (admin always full)
  perm: () => PermissionOut
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
        return u.permission ?? FULL_PERM
      },
    }),
    { name: 'simnexus-auth' }
  )
)
