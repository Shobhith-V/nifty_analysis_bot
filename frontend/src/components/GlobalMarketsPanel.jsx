import { useStore } from '../store/useStore'

const SYMBOL_ORDER = [
  '^NSEI', '^GSPC', '^DJI', '^IXIC',
  '^N225', '^HSI', '^FTSE', '^GDAXI',
  'CL=F', 'BZ=F', 'GC=F', 'INR=X', 'DX-Y.NYB', '^VIX',
]

function MarketRow({ item }) {
  if (!item) return null
  const isUp = item.direction === 'UP'
  const pctColor = isUp ? 'text-terminal-green' : 'text-terminal-red'
  const arrow = isUp ? '▲' : '▼'

  return (
    <div className="flex items-center justify-between py-1.5 border-b border-terminal-border/30 last:border-0">
      <div>
        <div className="text-xs font-sans text-terminal-text">{item.label}</div>
        <div className="text-xs font-mono text-terminal-text-dim">{item.symbol}</div>
      </div>
      <div className="text-right">
        <div className="font-mono text-sm text-terminal-text">
          {item.price?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
        <div className={`text-xs font-mono font-semibold ${pctColor}`}>
          {arrow} {Math.abs(item.change_pct)?.toFixed(2)}%
        </div>
      </div>
    </div>
  )
}

export default function GlobalMarketsPanel() {
  const globalMarkets = useStore(s => s.globalMarkets)

  if (!globalMarkets) {
    return (
      <div className="bg-terminal-card rounded-lg border border-terminal-border p-4">
        <div className="text-terminal-text-dim text-sm font-mono">Global markets loading...</div>
      </div>
    )
  }

  const insights = globalMarkets.insights || []

  return (
    <div className="bg-terminal-card rounded-lg border border-terminal-border p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-terminal-text font-sans font-semibold text-sm">Global Markets</h3>
        <span className="text-xs text-terminal-text-dim font-mono">
          {globalMarkets.last_updated
            ? new Date(globalMarkets.last_updated).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false })
            : '—'}
        </span>
      </div>

      {/* Insights */}
      {insights.length > 0 && (
        <div className="mb-3 space-y-1">
          {insights.map((ins, i) => (
            <div key={i} className="text-xs text-terminal-accent bg-terminal-accent/10 border border-terminal-accent/20 rounded px-2 py-1 font-sans">
              {ins}
            </div>
          ))}
        </div>
      )}

      {/* Markets list */}
      <div className="max-h-96 overflow-y-auto">
        {SYMBOL_ORDER.map(sym => {
          const item = globalMarkets[sym]
          return item ? <MarketRow key={sym} item={item} /> : null
        })}
      </div>

      {globalMarkets.error && (
        <div className="text-terminal-red text-xs font-mono mt-2">{globalMarkets.error}</div>
      )}
    </div>
  )
}
