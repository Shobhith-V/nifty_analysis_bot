function PolymarketPage() {
  const polys = window.POLY_LIVE && window.POLY_LIVE.length ? window.POLY_LIVE : POLY;
  const [sort, setSort] = React.useState('yes');

  const sorted = [...polys].sort((a, b) => {
    if (sort === 'yes')  return b.yes - a.yes;
    if (sort === 'vol')  return parseFloat(String(b.vol).replace(/[^0-9.]/g,'')) - parseFloat(String(a.vol).replace(/[^0-9.]/g,''));
    return 0;
  });

  const totalVol = polys.reduce((s, p) => s + (parseFloat(String(p.vol).replace(/[^0-9.]/g,'')) || 0), 0);
  const avgYes = polys.length ? Math.round(polys.reduce((s,p)=>s+p.yes,0) / polys.length) : 0;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, padding: 16, gap: 12, overflow: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, flexWrap: 'wrap' }}>
        <h1 className="serif" style={{ margin: 0, fontSize: 32, fontStyle: 'italic', fontWeight: 400, color: 'var(--fg)' }}>
          Polymarket <span style={{ color: 'var(--cyan)' }}>·</span> India & Macro
        </h1>
        <div className="mono" style={{ fontSize: 10, color: 'var(--dim)', letterSpacing: '0.1em' }}>
          PREDICTION MARKETS · AUTO-REFRESH 10s
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          <button className={"btn sm " + (sort === 'yes' ? "active" : "")} onClick={() => setSort('yes')}>Sort: YES%</button>
          <button className={"btn sm " + (sort === 'vol' ? "active" : "")} onClick={() => setSort('vol')}>Sort: Volume</button>
        </div>
      </div>

      {/* Summary strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
        <div className="panel" style={{ padding: 12 }}>
          <div className="mono" style={{ fontSize: 9, color: 'var(--dim)', letterSpacing: '0.15em' }}>MARKETS</div>
          <div className="mono" style={{ fontSize: 24, color: 'var(--fg)', fontWeight: 600 }}>{polys.length}</div>
        </div>
        <div className="panel" style={{ padding: 12 }}>
          <div className="mono" style={{ fontSize: 9, color: 'var(--dim)', letterSpacing: '0.15em' }}>TOTAL VOLUME</div>
          <div className="mono" style={{ fontSize: 24, color: 'var(--fg)', fontWeight: 600 }}>${totalVol.toFixed(0)}k</div>
        </div>
        <div className="panel" style={{ padding: 12 }}>
          <div className="mono" style={{ fontSize: 9, color: 'var(--dim)', letterSpacing: '0.15em' }}>AVG YES</div>
          <div className="mono" style={{ fontSize: 24, color: 'var(--cyan)', fontWeight: 600 }}>{avgYes}¢</div>
        </div>
        <div className="panel" style={{ padding: 12 }}>
          <div className="mono" style={{ fontSize: 9, color: 'var(--dim)', letterSpacing: '0.15em' }}>SENTIMENT</div>
          <div className="mono" style={{ fontSize: 14, color: avgYes >= 50 ? 'var(--green)' : 'var(--red)', fontWeight: 600, marginTop: 4 }}>
            {avgYes >= 60 ? 'STRONG YES' : avgYes >= 50 ? 'LEANING YES' : avgYes >= 40 ? 'LEANING NO' : 'STRONG NO'}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: 12 }}>
        {sorted.map((p, i) => {
          const yesCol = p.yes >= 60 ? 'var(--green)' : p.yes >= 40 ? 'var(--cyan)' : 'var(--red)';
          return (
            <article key={i} className="panel" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 14, color: 'var(--fg)', lineHeight: 1.4, textWrap: 'pretty' }}>{p.q}</div>
              <div style={{ position: 'relative', height: 28, background: 'var(--bg-2)', border: '1px solid var(--hairline-soft)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{
                  position: 'absolute', left: 0, top: 0, bottom: 0, width: `${p.yes}%`,
                  background: 'oklch(0.74 0.16 145 / 0.22)',
                  borderRight: `1px solid ${yesCol}`
                }} />
                <div className="mono" style={{
                  position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
                  justifyContent: 'space-between', padding: '0 10px', fontSize: 11, fontWeight: 600
                }}>
                  <span style={{ color: 'var(--green)' }}>YES {p.yes}¢</span>
                  <span style={{ color: 'var(--red)' }}>NO {100 - p.yes}¢</span>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="mono" style={{ fontSize: 10, color: 'var(--dim)' }}>VOL · {p.vol}</span>
                {p.url ? (
                  <a href={p.url} target="_blank" rel="noopener noreferrer" className="btn sm" style={{ textDecoration: 'none' }}>Open ↗</a>
                ) : (
                  <Chip tone={p.yes >= 50 ? 'green' : 'red'}>{p.yes >= 50 ? 'BULLISH' : 'BEARISH'}</Chip>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

window.PolymarketPage = PolymarketPage;
