function NewsPage() {
  const [filter, setFilter] = React.useState('all');
  const news = window.NEWS_LIVE && window.NEWS_LIVE.length ? window.NEWS_LIVE : NEWS;
  const filtered = filter === 'all' ? news : news.filter(n => n.impact === filter);
  const counts = {
    all: news.length,
    bullish: news.filter(n => n.impact === 'bullish').length,
    bearish: news.filter(n => n.impact === 'bearish').length,
    neutral: news.filter(n => n.impact === 'neutral').length,
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, padding: 16, gap: 12, overflow: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, flexWrap: 'wrap' }}>
        <h1 className="serif" style={{ margin: 0, fontSize: 32, fontStyle: 'italic', fontWeight: 400, color: 'var(--fg)' }}>
          News <span style={{ color: 'var(--cyan)' }}>·</span> NIFTY 50
        </h1>
        <div className="mono" style={{ fontSize: 10, color: 'var(--dim)', letterSpacing: '0.1em' }}>
          AGGREGATED · AUTO-REFRESH 10s · {news.length} STORIES
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          {[
            ['all', 'All', 'cyan'],
            ['bullish', 'Bullish', 'green'],
            ['bearish', 'Bearish', 'red'],
            ['neutral', 'Neutral', 'default'],
          ].map(([id, label, tone]) => (
            <button key={id}
              className={"btn sm " + (filter === id ? "active" : "")}
              onClick={() => setFilter(id)}>
              {label} <span style={{ opacity: 0.6, marginLeft: 4 }}>{counts[id] ?? 0}</span>
            </button>
          ))}
        </div>
      </div>

      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))', gap: 12
      }}>
        {filtered.map((n, i) => {
          const col = n.impact === 'bullish' ? 'var(--green)' : n.impact === 'bearish' ? 'var(--red)' : 'var(--dim)';
          const bgCol = n.impact === 'bullish' ? 'var(--green-soft)' : n.impact === 'bearish' ? 'var(--red-soft)' : 'transparent';
          return (
            <article key={i} className="panel" style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
                borderBottom: '1px solid var(--hairline-soft)', background: bgCol
              }}>
                <span style={{ width: 6, height: 6, borderRadius: 0.5, background: col }} />
                <span className="mono" style={{ fontSize: 9, letterSpacing: '0.15em', color: 'var(--fg-2)', textTransform: 'uppercase' }}>{n.src}</span>
                <span className="mono" style={{ marginLeft: 'auto', fontSize: 9, color: 'var(--dim)' }}>{n.t}</span>
                <Chip tone={n.impact === 'bullish' ? 'green' : n.impact === 'bearish' ? 'red' : 'default'}>
                  {n.impact}
                </Chip>
              </div>
              <div style={{ padding: 14 }}>
                <div style={{ fontSize: 15, color: 'var(--fg)', lineHeight: 1.45, fontFamily: 'var(--sans)', textWrap: 'pretty' }}>
                  {n.headline}
                </div>
                {n.summary && (
                  <div className="mono" style={{ fontSize: 11, color: 'var(--dim)', marginTop: 8, lineHeight: 1.5 }}>
                    {n.summary}
                  </div>
                )}
              </div>
              {n.url && (
                <div style={{ padding: '8px 12px', borderTop: '1px solid var(--hairline-soft)', display: 'flex', justifyContent: 'flex-end' }}>
                  <a href={n.url} target="_blank" rel="noopener noreferrer" className="btn sm" style={{ textDecoration: 'none' }}>
                    Read source ↗
                  </a>
                </div>
              )}
            </article>
          );
        })}
        {filtered.length === 0 && (
          <div className="mono" style={{ padding: 24, color: 'var(--dim)', fontSize: 12 }}>
            No news matches filter.
          </div>
        )}
      </div>
    </div>
  );
}

window.NewsPage = NewsPage;
