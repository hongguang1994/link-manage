import { useEffect, useRef } from 'react'
import { useModemStore } from '../store/modemStore'
import { useAuthStore } from '../store/authStore'

export function useModemSocket() {
  const setModems = useModemStore(s => s.setModems)
  const token = useAuthStore(s => s.token)
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    if (!token) return

    const connect = () => {
      const protocol = location.protocol === 'https:' ? 'wss' : 'ws'
      const ws = new WebSocket(`${protocol}://${location.host}/ws/modems?token=${token}`)
      wsRef.current = ws
      ws.onmessage = e => {
        try { setModems(JSON.parse(e.data)) } catch {}
      }
      ws.onclose = (e) => {
        if (e.code !== 4001) setTimeout(connect, 3000)
      }
    }
    connect()
    return () => wsRef.current?.close()
  }, [token, setModems])
}
