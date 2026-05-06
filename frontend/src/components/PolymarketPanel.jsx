import { useStore } from '../store/useStore'

export default function PolymarketPanel() {
  const polymarket = useStore(s => s.polymarket)

  if (!polymarket) {
    return (
      <div className="bg-terminal-card rounded-lg border border-terminal-border p-4">
        <div className="text-terminal-text-dim text-sm font-mono">Polymarket loading...</div>
      </div>
    )
  }

  return (
    <div className="bg-terminal-card rounded-lg border border-terminal-border p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-terminal-text font-sans font-semibold text-sm">Prediction Markets</h3>
        <div className="flex items-center gap-2">
          {!polymarket.has_live_feed && (
            <span className="text-xs text-terminal-muted font-mono">placeholder</span>
          )}
          <span className="text-xs text-terminal-text-dim font-mono">Polymarket</span>
        </div>
      </div>

      <div className="space-y-3">
        {(polymarket.markets || []).map((m) => (
          <div key={m.id} className="bg-terminal-bg/50 border border-terminal-border/50 rounded p-3">
            <div className="text-xs font-sans text-terminal-text mb-2 leading-relaxed">
              {m.url
                ? <a href={m.url} target="_blank" rel="noreferrer" className="hover:text-terminal-accent transition-colors">{m.question}</a>
                : m.question
              }
            </div>
            <div className="flex items-center gap-2">
              {/* Yes bar */}
              <span className="text-xs font-mono text-terminal-green w-8 shrink-0">YES</span>
              <div className="flex-1 h-2 bg-terminal-muted/20 rounded-full overflow-hidden">
                <div
                  className="h-full bg-terminal-green/70 rounded-full"
                  style={{ width: `${m.yes_pct}%` }}
                />
              </div>
              <span className="text-xs font-mono text-terminal-green w-10 text-right shrink-0">
                {m.yes_pct?.toFixed(0)}%
              </span>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs font-mono text-terminal-red w-8 shrink-0">NO</span>
              <div className="flex-1 h-2 bg-terminal-muted/20 rounded-full overflow-hidden">
                <div
                  className="h-full bg-terminal-red/70 rounded-full"
                  style={{ width: `${m.no_pct}%` }}
                />
              </div>
              <span className="text-xs font-mono text-terminal-red w-10 text-right shrink-0">
                {m.no_pct?.toFixed(0)}%
              </span>
            </div>
            <div className="flex justify-between mt-2 text-xs text-terminal-text-dim">
              <span>Ends: {m.end_date}</span>
              {m.volume > 0 && <span>Vol: ${(m.volume / 1000).toFixed(0)}K</span>}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 pt-3 border-t border-terminal-border">
        <p className="text-xs text-terminal-muted font-sans">{polymarket.disclaimer}</p>
        {!polymarket.has_live_feed && (
          <p className="text-xs text-terminal-muted font-sans mt-1">
            Add POLYMARKET_API_KEY to .env for live data.
          </p>
        )}
      </div>
    </div>
  )
}
