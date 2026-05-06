import { useEffect, useRef } from 'react'
import { useStore } from '../store/useStore'

const WS_URL = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws/live`

export function useWebSocket() {
  const wsRef = useRef(null)
  const reconnectTimer = useRef(null)
  const delay = useRef(1000)
  const handleWsTick = useStore(s => s.handleWsTick)
  const setWsConnected = useStore(s => s.setWsConnected)

  useEffect(() => {
    let mounted = true

    const connect = () => {
      if (!mounted) return

      try {
        const ws = new WebSocket(WS_URL)
        wsRef.current = ws

        ws.onopen = () => {
          if (!mounted) return
          setWsConnected(true)
          delay.current = 1000
        }

        ws.onmessage = (evt) => {
          if (!mounted) return
          try {
            const msg = JSON.parse(evt.data)
            handleWsTick(msg)
          } catch {}
        }

        ws.onerror = () => {
          setWsConnected(false)
        }

        ws.onclose = () => {
          setWsConnected(false)
          if (!mounted) return
          const d = delay.current
          delay.current = Math.min(d * 2, 60000)
          reconnectTimer.current = setTimeout(connect, d)
        }
      } catch (e) {
        setWsConnected(false)
        const d = delay.current
        delay.current = Math.min(d * 2, 60000)
        reconnectTimer.current = setTimeout(connect, d)
      }
    }

    connect()

    return () => {
      mounted = false
      clearTimeout(reconnectTimer.current)
      wsRef.current?.close()
    }
  }, [])
}
