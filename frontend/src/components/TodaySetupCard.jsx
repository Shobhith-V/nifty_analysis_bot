import { useStore } from '../store/useStore'

const BIAS_STYLES = {
  BULLISH: {
    bg: 'bg-terminal-green/10',
    border: 'border-terminal-green/40',
    text: 'text-terminal-green',
    icon: '▲',
  },
  BEARISH: {
    bg: 'bg-terminal-red/10',
    border: 'border-terminal-red/40',
    text: 'text-terminal-red',
    icon: '▼',
  },
  NEUTRAL: {
    bg: 'bg-terminal-yellow/10',
    border: 'border-terminal-yellow/40',
    text: 'text-terminal-yellow',
    icon: '◆',
  },
}

export default function TodaySetupCard() {
  const bias = useStore(s => s.bias)
  const ltp = useStore(s => s.ltp)
  const ltpChange = useStore(s => s.ltpChange)
  const indicators = useStore(s => s.indicators)

  if (!bias) {
    return (
      <div className="bg-terminal-card rounded-lg border border-terminal-border p-4">
        <div className="text-terminal-text-dim text-sm font-mono">Calculating bias...</div>
      </div>
    )
  }

  const style = BIAS_STYLES[bias.bias] || BIAS_STYLES.NEUTRAL
  const isPositive = ltpChange >= 0

  return (
    <div className="bg-terminal-card rounded-lg border border-terminal-border p-4">
      {/* LTP */}
      <div className="flex items-end justify-between mb-3">
        <div>
          <div className="text-terminal-text-dim text-xs font-sans mb-1">NIFTY 50</div>
          <div className={`font-mono text-2xl font-bold ${ltp ? 'text-terminal-text' : 'text-terminal-muted'}`}>
            {ltp?.toLocaleString('en-IN', { minimumFractionDigits: 2 }) || '—'}
          </div>
        </div>
        {ltpChange !== null && ltpChange !== undefined && (
          <div className={`text-right ${isPositive ? 'text-terminal-green' : 'text-terminal-red'}`}>
            <div className="font-mono text-sm font-semibold">
              {isPositive ? '+' : ''}{ltpChange?.toFixed(2)}
            </div>
          </div>
        )}
      </div>

      {/* Indicators bar */}
      {indicators && (
        <div className="grid grid-cols-3 gap-1 mb-3 text-center">
          {[
            { label: 'RSI', value: indicators.rsi14?.toFixed(0) },
            { label: 'EMA9', value: indicators.ema9?.toLocaleString('en-IN', { minimumFractionDigits: 0 }) },
            { label: 'VWAP', value: indicators.vwap?.toLocaleString('en-IN', { minimumFractionDigits: 0 }) },
          ].map(({ label, value }) => (
            <div key={label} className="bg-terminal-bg/50 rounded px-2 py-1.5">
              <div className="text-terminal-text-dim text-xs font-sans">{label}</div>
              <div className="font-mono text-xs text-terminal-text">{value || '—'}</div>
            </div>
          ))}
        </div>
      )}

      {/* Bias */}
      <div className={`rounded border p-3 ${style.bg} ${style.border}`}>
        <div className="flex items-center justify-between mb-2">
          <span className={`font-mono text-base font-bold ${style.text}`}>
            {style.icon} {bias.bias}
          </span>
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-20 bg-terminal-muted/20 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${bias.bias === 'BULLISH' ? 'bg-terminal-green' : bias.bias === 'BEARISH' ? 'bg-terminal-red' : 'bg-terminal-yellow'}`}
                style={{ width: `${bias.confidence}%` }}
              />
            </div>
            <span className={`text-xs font-mono ${style.text}`}>{bias.confidence}%</span>
          </div>
        </div>
        <div className="space-y-0.5">
          {(bias.factors || []).slice(0, 5).map((f, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <span className={
                f.signal === 'BULLISH' ? 'text-terminal-green' :
                f.signal === 'BEARISH' ? 'text-terminal-red' : 'text-terminal-yellow'
              }>
                {f.signal === 'BULLISH' ? '↑' : f.signal === 'BEARISH' ? '↓' : '–'}
              </span>
              <span className="text-terminal-text-dim font-sans">{f.factor}</span>
            </div>
          ))}
        </div>
      </div>

      {/* VWAP position */}
      {indicators?.above_vwap !== null && indicators?.above_vwap !== undefined && (
        <div className={`mt-2 text-xs font-mono text-center py-1 rounded ${
          indicators.above_vwap
            ? 'bg-terminal-green/10 text-terminal-green'
            : 'bg-terminal-red/10 text-terminal-red'
        }`}>
          Price {indicators.above_vwap ? 'ABOVE' : 'BELOW'} VWAP
        </div>
      )}
    </div>
  )
}
