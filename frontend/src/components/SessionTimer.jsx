import { useState, useEffect } from 'react'
import { useStore } from '../store/useStore'

const SESSION_COLORS = {
  'PRE-MARKET':      'text-terminal-yellow',
  'PRE-OPEN':        'text-terminal-yellow',
  'MORNING-SESSION': 'text-terminal-green',
  'MID-SESSION':     'text-terminal-blue',
  'EXPIRY-SESSION':  'text-terminal-red',
  'CLOSED':          'text-terminal-muted',
  'LOADING':         'text-terminal-muted',
}

const SESSION_BG = {
  'MORNING-SESSION': 'bg-terminal-green/10 border-terminal-green/30',
  'EXPIRY-SESSION':  'bg-terminal-red/10 border-terminal-red/30',
  'CLOSED':          'bg-terminal-muted/10 border-terminal-muted/30',
  'PRE-MARKET':      'bg-terminal-yellow/10 border-terminal-yellow/30',
  'PRE-OPEN':        'bg-terminal-yellow/10 border-terminal-yellow/30',
  'MID-SESSION':     'bg-terminal-blue/10 border-terminal-blue/30',
}

function getIST() {
  return new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false })
}

function getISTDate() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }))
}

function getNextSessionTarget() {
  const now = getISTDate()
  const h = now.getHours(), m = now.getMinutes()

  const targets = [
    { label: 'Pre-Open', h: 9, m: 0 },
    { label: 'Market Open', h: 9, m: 15 },
    { label: 'Expiry Close', h: 15, m: 30 },
  ]

  for (const t of targets) {
    if (h < t.h || (h === t.h && m < t.m)) {
      const target = new Date(now)
      target.setHours(t.h, t.m, 0, 0)
      const diff = Math.max(0, target - now)
      const hrs = Math.floor(diff / 3600000)
      const mins = Math.floor((diff % 3600000) / 60000)
      const secs = Math.floor((diff % 60000) / 1000)
      return {
        label: t.label,
        countdown: `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`,
        diff,
      }
    }
  }
  return null
}

export default function SessionTimer() {
  const sessionStatus = useStore(s => s.sessionStatus)
  const expiry = useStore(s => s.expiry)
  const wsConnected = useStore(s => s.wsConnected)

  const [clock, setClock] = useState('')
  const [nextSession, setNextSession] = useState(null)

  useEffect(() => {
    const tick = () => {
      setClock(getIST())
      setNextSession(getNextSessionTarget())
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  const sessionColor = SESSION_COLORS[sessionStatus] || 'text-terminal-muted'
  const sessionBg = SESSION_BG[sessionStatus] || 'bg-terminal-muted/10 border-terminal-muted/30'

  return (
    <div className="bg-terminal-card rounded-lg border border-terminal-border p-4">
      {/* Clock */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-terminal-text-dim text-xs font-sans mb-1">IST Time</div>
          <div className="font-mono text-xl text-terminal-text font-semibold tracking-wider">
            {clock.split(', ')[1] || clock}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-terminal-green animate-pulse' : 'bg-terminal-muted'}`} />
          <span className="text-xs text-terminal-text-dim font-mono">
            {wsConnected ? 'LIVE' : 'OFFLINE'}
          </span>
        </div>
      </div>

      {/* Session status */}
      <div className={`rounded border px-3 py-2 ${sessionBg} mb-3`}>
        <div className="flex items-center justify-between">
          <span className={`font-mono text-sm font-bold ${sessionColor}`}>
            {sessionStatus}
          </span>
          {sessionStatus === 'EXPIRY-SESSION' && (
            <span className="text-xs bg-terminal-red/20 text-terminal-red border border-terminal-red/30 px-2 py-0.5 rounded font-mono">
              EXPIRY DAY
            </span>
          )}
        </div>
      </div>

      {/* Countdown to next session */}
      {nextSession && (
        <div className="flex items-center justify-between text-xs">
          <span className="text-terminal-text-dim font-sans">→ {nextSession.label}</span>
          <span className="font-mono text-terminal-accent font-semibold">{nextSession.countdown}</span>
        </div>
      )}

      {/* Expiry info */}
      {expiry && (
        <div className="mt-3 pt-3 border-t border-terminal-border">
          <div className="flex items-center justify-between text-xs">
            <span className="text-terminal-text-dim">
              {expiry.expiry_type} Expiry
            </span>
            <span className={`font-mono font-semibold ${expiry.days_to_expiry === 0 ? 'text-terminal-red' : expiry.days_to_expiry <= 2 ? 'text-terminal-yellow' : 'text-terminal-text'}`}>
              {expiry.days_to_expiry === 0 ? 'TODAY' : `${expiry.days_to_expiry}d`} · {expiry.next_expiry}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
