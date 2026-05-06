import { useStore } from '../store/useStore'
import { formatDistanceToNow } from 'date-fns'

const DIRECTION_ICON = { BULLISH: '↑', BEARISH: '↓', NEUTRAL: '●' }
const DIRECTION_CLASS = {
  BULLISH: 'signal-bullish',
  BEARISH: 'signal-bearish',
  NEUTRAL: 'signal-neutral',
}

function ConfidenceDots({ score }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <div
          key={i}
          className={`w-1.5 h-1.5 rounded-full ${i <= score ? 'bg-terminal-accent' : 'bg-terminal-muted/30'}`}
        />
      ))}
    </div>
  )
}

function BiasCard({ bias }) {
  if (!bias) return null
  const color = bias.bias === 'BULLISH'
    ? 'text-terminal-green border-terminal-green/30 bg-terminal-green/10'
    : bias.bias === 'BEARISH'
    ? 'text-terminal-red border-terminal-red/30 bg-terminal-red/10'
    : 'text-terminal-yellow border-terminal-yellow/30 bg-terminal-yellow/10'

  return (
    <div className={`rounded-lg border p-3 mb-3 ${color}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="font-mono text-sm font-bold">{bias.bias}</span>
        <span className="font-mono text-xs opacity-80">{bias.confidence}% confidence</span>
      </div>
      <div className="space-y-1">
        {(bias.factors || []).slice(0, 4).map((f, i) => (
          <div key={i} className="flex items-center gap-2 text-xs opacity-80">
            <span className={
              f.signal === 'BULLISH' ? 'text-terminal-green' :
              f.signal === 'BEARISH' ? 'text-terminal-red' : 'text-terminal-yellow'
            }>
              {f.signal === 'BULLISH' ? '↑' : f.signal === 'BEARISH' ? '↓' : '–'}
            </span>
            <span className="font-sans">{f.factor}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function SignalsPanel() {
  const signals = useStore(s => s.signals)
  const bias = useStore(s => s.bias)

  return (
    <div className="bg-terminal-card rounded-lg border border-terminal-border p-4">
      <h3 className="text-terminal-text font-sans font-semibold text-sm mb-3">
        Signals Feed
      </h3>

      <BiasCard bias={bias} />

      {signals.length === 0 ? (
        <div className="text-terminal-text-dim text-xs font-mono text-center py-4">
          No signals detected yet
        </div>
      ) : (
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {signals.map((sig, i) => (
            <div
              key={i}
              className="flex items-start gap-2 p-2 rounded bg-terminal-bg/50 border border-terminal-border/50"
            >
              <span className={`signal-badge ${DIRECTION_CLASS[sig.direction]} shrink-0 mt-0.5`}>
                {DIRECTION_ICON[sig.direction]} {sig.direction}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-mono text-terminal-text truncate">
                    {sig.type?.replace(/_/g, ' ')}
                  </span>
                  <span className="text-xs font-mono text-terminal-text-dim shrink-0">
                    {sig.price?.toLocaleString('en-IN')}
                  </span>
                </div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-xs text-terminal-text-dim font-sans truncate">
                    {sig.description}
                  </span>
                  <ConfidenceDots score={sig.confidence} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {bias?.disclaimer && (
        <div className="mt-3 pt-3 border-t border-terminal-border">
          <p className="text-xs text-terminal-muted font-sans italic">{bias.disclaimer}</p>
        </div>
      )}
    </div>
  )
}
