import { create } from 'zustand'

interface ModemSummary {
  id: number
  alias: string | null
  device_path: string
  operator: string | null
  signal_quality: number
  status: string
  phone_number: string | null
}

interface ModemStore {
  modems: ModemSummary[]
  setModems: (modems: ModemSummary[]) => void
}

export const useModemStore = create<ModemStore>(set => ({
  modems: [],
  setModems: modems => set({ modems }),
}))
