import { useStore } from '../store/useStore'

const SENTIMENT_COLORS = {
  BULLISH: 'text-terminal-green',
  BEARISH: 'text-terminal-red',
  NEUTRAL: 'text-terminal-text-dim',
}

const IMPACT_COLORS = {
  HIGH: 'text-terminal-red bg-terminal-red/10 border-terminal-red/30',
  MEDIUM: 'text-terminal-yellow bg-terminal-yellow/10 border-terminal-yellow/30',
  LOW: 'text-terminal-text-dim bg-terminal-muted/10 border-terminal-muted/30',
}

export default function NewsPanel() {
  const news = useStore(s => s.news)

  if (!news) {
    return (
      <div className="bg-terminal-card rounded-lg border border-terminal-border p-4">
        <div className="text-terminal-text-dim text-sm font-mono">News loading...</div>
      </div>
    )
  }

  return (
    <div className="bg-terminal-card rounded-lg border border-terminal-border p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-terminal-text font-sans font-semibold text-sm">News & Events</h3>
        <div className={`text-xs font-mono font-semibold ${SENTIMENT_COLORS[news.overall_sentiment]}`}>
          {news.overall_sentiment}
          {!news.has_live_feed && (
            <span className="ml-2 text-terminal-muted">(placeholder)</span>
          )}
        </div>
      </div>

      {/* Economic Calendar */}
      {news.economic_calendar?.length > 0 && (
        <div className="mb-3">
          <div className="text-terminal-text-dim text-xs font-sans mb-2 uppercase tracking-wide">
            Economic Calendar
          </div>
          <div className="space-y-1">
            {news.economic_calendar.map((ev, i) => (
              <div key={i} className="flex items-center justify-between gap-2 py-1">
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-1.5 py-0.5 rounded border font-mono ${IMPACT_COLORS[ev.impact]}`}>
                    {ev.impact}
                  </span>
                  <span className="text-xs font-sans text-terminal-text truncate max-w-[160px]">
                    {ev.event}
                  </span>
                </div>
                <span className="text-xs font-mono text-terminal-text-dim shrink-0">
                  {ev.today ? 'TODAY' : `${ev.days_away}d`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Headlines */}
      <div>
        <div className="text-terminal-text-dim text-xs font-sans mb-2 uppercase tracking-wide">
          Headlines
        </div>
        <div className="space-y-2">
          {(news.headlines || []).map((h, i) => (
            <div key={i} className="border-b border-terminal-border/30 pb-2 last:border-0">
              <div className="flex items-start gap-2">
                <span className={`text-xs font-bold shrink-0 mt-0.5 ${SENTIMENT_COLORS[h.sentiment]}`}>
                  {h.sentiment === 'BULLISH' ? '↑' : h.sentiment === 'BEARISH' ? '↓' : '–'}
                </span>
                <div>
                  <div className="text-xs font-sans text-terminal-text leading-relaxed">
                    {h.url
                      ? <a href={h.url} target="_blank" rel="noreferrer" className="hover:text-terminal-accent transition-colors">{h.title}</a>
                      : h.title
                    }
                  </div>
                  <div className="text-xs text-terminal-text-dim mt-0.5">{h.source}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {!news.has_live_feed && (
        <div className="mt-3 pt-3 border-t border-terminal-border">
          <p className="text-xs text-terminal-muted font-sans">
            Add NEWS_API_KEY to .env to enable live headlines.
          </p>
        </div>
      )}
    </div>
  )
}
