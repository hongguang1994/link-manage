import { useEffect, useRef } from 'react'
import { useModemStore } from '../store/modemStore'

export function useModemSocket() {
  const setModems = useModemStore(s => s.setModems)
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    const connect = () => {
      const protocol = location.protocol === 'https:' ? 'wss' : 'ws'
      const ws = new WebSocket(`${protocol}://${location.host}/ws/modems`)
      wsRef.current = ws
      ws.onmessage = e => {
        try { setModems(JSON.parse(e.data)) } catch {}
      }
      ws.onclose = () => setTimeout(connect, 3000)
    }
    connect()
    return () => wsRef.current?.close()
  }, [setModems])
}
