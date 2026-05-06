import { useStore } from '../store/useStore'

const LEVEL_COLORS = {
  r3: '#ff1a3d', r2: '#ff4d6d', r1: '#ff8099',
  tc: '#4da6ff', pivot: '#ffd700', bc: '#4da6ff',
  s1: '#66ffcc', s2: '#00c896', s3: '#009970',
}

function LevelRow({ label, value, color, current, bold }) {
  const isNear = current && Math.abs(current - value) < 15
  return (
    <div className={`flex items-center justify-between py-1 px-2 rounded ${isNear ? 'bg-white/5' : ''}`}>
      <div className="flex items-center gap-2">
        <div className="w-3 h-0.5 rounded" style={{ backgroundColor: color }} />
        <span className={`text-xs font-mono ${bold ? 'font-bold text-terminal-text' : 'text-terminal-text-dim'}`}>
          {label}
        </span>
      </div>
      <span className={`font-mono text-sm ${bold ? 'font-bold' : 'font-medium'}`} style={{ color }}>
        {value?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
      </span>
    </div>
  )
}

export default function CPRPanel() {
  const cpr = useStore(s => s.cpr)
  const ltp = useStore(s => s.ltp)

  if (!cpr) {
    return (
      <div className="bg-terminal-card rounded-lg border border-terminal-border p-4">
        <div className="text-terminal-text-dim text-sm font-mono">CPR loading...</div>
      </div>
    )
  }

  const d = cpr.daily || {}
  const weekly = cpr.weekly
  const monthly = cpr.monthly

  return (
    <div className="bg-terminal-card rounded-lg border border-terminal-border p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-terminal-text font-sans font-semibold text-sm">CPR Levels</h3>
        <div className="flex items-center gap-2">
          {cpr.is_virgin && (
            <span className="text-xs bg-terminal-accent/20 text-terminal-accent border border-terminal-accent/30 px-2 py-0.5 rounded font-mono">
              VIRGIN
            </span>
          )}
          {cpr.cpr_type && (
            <span className={`text-xs px-2 py-0.5 rounded font-mono border ${
              cpr.cpr_type === 'NARROW' || cpr.cpr_type === 'VERY_NARROW'
                ? 'bg-terminal-green/10 text-terminal-green border-terminal-green/30'
                : 'bg-terminal-yellow/10 text-terminal-yellow border-terminal-yellow/30'
            }`}>
              {cpr.cpr_type?.replace('_', ' ')}
            </span>
          )}
        </div>
      </div>

      {/* Prediction */}
      {cpr.prediction && (
        <div className="mb-3 p-2 bg-terminal-accent/10 border border-terminal-accent/20 rounded text-xs text-terminal-accent font-mono">
          {cpr.prediction}
        </div>
      )}

      {/* Magnet signal */}
      {cpr.magnet_signal && (
        <div className={`mb-3 p-2 rounded text-xs font-mono border ${
          cpr.magnet_signal.includes('ABOVE')
            ? 'bg-terminal-green/10 text-terminal-green border-terminal-green/30'
            : cpr.magnet_signal.includes('BELOW')
            ? 'bg-terminal-red/10 text-terminal-red border-terminal-red/30'
            : 'bg-terminal-yellow/10 text-terminal-yellow border-terminal-yellow/30'
        }`}>
          ⊙ {cpr.magnet_signal?.replace(/_/g, ' ')}
        </div>
      )}

      {/* Daily CPR levels */}
      <div className="space-y-0.5">
        <LevelRow label="R3" value={d.r3} color={LEVEL_COLORS.r3} current={ltp} />
        <LevelRow label="R2" value={d.r2} color={LEVEL_COLORS.r2} current={ltp} />
        <LevelRow label="R1" value={d.r1} color={LEVEL_COLORS.r1} current={ltp} />
        <div className="border-t border-terminal-border/50 my-1" />
        <LevelRow label="TC" value={d.tc} color={LEVEL_COLORS.tc} current={ltp} bold />
        <LevelRow label="Pivot" value={d.pivot} color={LEVEL_COLORS.pivot} current={ltp} bold />
        <LevelRow label="BC" value={d.bc} color={LEVEL_COLORS.bc} current={ltp} bold />
        <div className="border-t border-terminal-border/50 my-1" />
        <LevelRow label="S1" value={d.s1} color={LEVEL_COLORS.s1} current={ltp} />
        <LevelRow label="S2" value={d.s2} color={LEVEL_COLORS.s2} current={ltp} />
        <LevelRow label="S3" value={d.s3} color={LEVEL_COLORS.s3} current={ltp} />
      </div>

      {/* CPR Width */}
      <div className="mt-3 pt-3 border-t border-terminal-border flex justify-between text-xs">
        <span className="text-terminal-text-dim">CPR Width</span>
        <span className="font-mono text-terminal-text">
          {d.cpr_width?.toFixed(2)} ({d.cpr_width_pct?.toFixed(3)}%)
        </span>
      </div>

      {/* Weekly / Monthly CPR summary */}
      {(weekly || monthly) && (
        <div className="mt-3 pt-3 border-t border-terminal-border space-y-1">
          {weekly && (
            <div className="flex justify-between text-xs">
              <span className="text-terminal-text-dim">W-Pivot</span>
              <span className="font-mono text-terminal-blue">{weekly.pivot?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            </div>
          )}
          {monthly && (
            <div className="flex justify-between text-xs">
              <span className="text-terminal-text-dim">M-Pivot</span>
              <span className="font-mono text-terminal-purple">{monthly.pivot?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
