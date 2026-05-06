import { useStore } from '../store/useStore'

export default function GapAnalysisCard() {
  const gap = useStore(s => s.gap)
  const orb = useStore(s => s.orb)

  if (!gap) {
    return (
      <div className="bg-terminal-card rounded-lg border border-terminal-border p-4">
        <div className="text-terminal-text-dim text-sm font-mono">Gap data loading...</div>
      </div>
    )
  }

  const isGapUp = gap.gap_pct > 0
  const isSignificant = Math.abs(gap.gap_pct) >= 0.75
  const hasGap = gap.gap_type !== 'FLAT_OPEN'
  const fill = gap.fill || {}

  const gapColor = hasGap
    ? isGapUp
      ? 'text-terminal-green border-terminal-green/30 bg-terminal-green/10'
      : 'text-terminal-red border-terminal-red/30 bg-terminal-red/10'
    : 'text-terminal-text-dim border-terminal-muted/30 bg-terminal-muted/10'

  return (
    <div className="bg-terminal-card rounded-lg border border-terminal-border p-4">
      <h3 className="text-terminal-text font-sans font-semibold text-sm mb-3">Gap Analysis</h3>

      {/* Gap banner */}
      <div className={`rounded border p-3 mb-3 ${gapColor}`}>
        <div className="flex items-center justify-between">
          <span className="font-mono text-sm font-bold">
            {gap.gap_type?.replace(/_/g, ' ')}
          </span>
          <span className="font-mono text-lg font-bold">
            {gap.gap_pct > 0 ? '+' : ''}{gap.gap_pct?.toFixed(2)}%
          </span>
        </div>
        <div className="flex justify-between mt-1 text-xs opacity-80">
          <span>Prev Close: {gap.prev_close?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
          <span>Today Open: {gap.today_open?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
        </div>
      </div>

      {/* Gap fill status */}
      {hasGap && (
        <div className="mb-3">
          <div className="flex justify-between text-xs mb-1">
            <span className="text-terminal-text-dim">Gap Fill Progress</span>
            <span className={`font-mono font-semibold ${fill.filled ? 'text-terminal-green' : 'text-terminal-text'}`}>
              {fill.fill_pct?.toFixed(0)}%{fill.filled ? ' ✓ FILLED' : ''}
            </span>
          </div>
          <div className="h-1.5 bg-terminal-muted/20 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${isGapUp ? 'bg-terminal-green' : 'bg-terminal-red'}`}
              style={{ width: `${Math.min(fill.fill_pct || 0, 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* ORB status */}
      {orb && (
        <div className="space-y-1">
          {['15m', '30m', '60m'].map(period => {
            const o = orb[period]
            if (!o) return null
            const statusColor =
              o.status === 'BREAKOUT' || o.status === 'BREAKOUT_NO_VOL'
                ? 'text-terminal-green'
                : o.status === 'BREAKDOWN' || o.status === 'BREAKDOWN_NO_VOL'
                ? 'text-terminal-red'
                : 'text-terminal-text-dim'

            return (
              <div key={period} className="flex items-center justify-between text-xs bg-terminal-bg/50 rounded px-2 py-1.5">
                <span className="text-terminal-text-dim font-sans">ORB {period}</span>
                <div className="flex items-center gap-2 text-right">
                  <span className="font-mono text-terminal-text-dim">
                    {o.orb_low?.toLocaleString('en-IN')} – {o.orb_high?.toLocaleString('en-IN')}
                  </span>
                  <span className={`font-mono font-semibold ${statusColor}`}>
                    {o.status?.replace(/_/g, ' ')}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
