import { useStore } from '../store/useStore'

export default function VolumeAnalysis() {
  const volumeAnalysis = useStore(s => s.volumeAnalysis)
  const volumeProfile = useStore(s => s.volumeProfile)

  if (!volumeAnalysis) {
    return (
      <div className="bg-terminal-card rounded-lg border border-terminal-border p-4">
        <div className="text-terminal-text-dim text-sm font-mono">Volume data loading...</div>
      </div>
    )
  }

  const v = volumeAnalysis
  const surgeColor = v.volume_surge ? 'text-terminal-green' : 'text-terminal-text'

  return (
    <div className="bg-terminal-card rounded-lg border border-terminal-border p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-terminal-text font-sans font-semibold text-sm">Volume Analysis</h3>
        {v.volume_surge && (
          <span className="text-xs bg-terminal-green/20 text-terminal-green border border-terminal-green/30 px-2 py-0.5 rounded font-mono animate-pulse">
            SURGE {v.surge_ratio?.toFixed(1)}x
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="bg-terminal-bg/50 rounded p-2">
          <div className="text-terminal-text-dim text-xs font-sans mb-1">Current Vol</div>
          <div className={`font-mono text-sm font-semibold ${surgeColor}`}>
            {v.current_volume?.toLocaleString('en-IN')}
          </div>
        </div>
        <div className="bg-terminal-bg/50 rounded p-2">
          <div className="text-terminal-text-dim text-xs font-sans mb-1">Avg (10p)</div>
          <div className="font-mono text-sm text-terminal-text">
            {v.avg_10_period?.toLocaleString('en-IN')}
          </div>
        </div>
        <div className="bg-terminal-bg/50 rounded p-2">
          <div className="text-terminal-text-dim text-xs font-sans mb-1">Cumulative</div>
          <div className="font-mono text-sm text-terminal-text">
            {(v.cumulative_volume / 1e6)?.toFixed(2)}M
          </div>
        </div>
        <div className="bg-terminal-bg/50 rounded p-2">
          <div className="text-terminal-text-dim text-xs font-sans mb-1">Pace</div>
          <div className={`font-mono text-sm ${
            v.volume_pace_pct > 110 ? 'text-terminal-green' :
            v.volume_pace_pct < 90 ? 'text-terminal-red' : 'text-terminal-text'
          }`}>
            {v.volume_pace_pct?.toFixed(0)}%
          </div>
        </div>
      </div>

      {/* Volume Profile mini chart */}
      {volumeProfile && volumeProfile.length > 0 && (
        <div>
          <div className="text-terminal-text-dim text-xs font-sans mb-2">Volume Profile</div>
          <div className="space-y-0.5">
            {volumeProfile.slice().reverse().map((level, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-xs font-mono text-terminal-text-dim w-16 text-right shrink-0">
                  {level.price?.toLocaleString('en-IN', { minimumFractionDigits: 0 })}
                </span>
                <div className="flex-1 bg-terminal-muted/20 rounded-sm h-2 overflow-hidden">
                  <div
                    className="h-full bg-terminal-accent/60 rounded-sm"
                    style={{ width: `${level.pct}%` }}
                  />
                </div>
                <span className="text-xs font-mono text-terminal-text-dim w-8 shrink-0">
                  {level.pct?.toFixed(0)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
