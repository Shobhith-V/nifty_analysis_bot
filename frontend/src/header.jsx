function Header({ tab, setTab, t }) {
  const change = LTP - PREV_CLOSE;
  const changePct = (change / PREV_CLOSE) * 100;
  const up = change >= 0;

  return (
    <header style={{
      flexShrink: 0,
      borderBottom: '1px solid var(--hairline)',
      background: 'linear-gradient(to bottom, var(--panel), var(--bg-2))',
    }}>
      {/* Top row: brand, ticker, status */}
      <div style={{ display: 'flex', alignItems: 'center', height: 56, padding: '0 16px', gap: 24 }}>
        <div className="brand">
          <span className="mark">Nifty</span>
          <span className="mark" style={{ color: 'var(--cyan)', fontStyle: 'italic' }}>Quant</span>
          <span className="sub">/ Lab v2.4</span>
        </div>

        <div className="vr" style={{ height: 32 }} />

        {/* Live LTP block */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div>
            <div className="mono" style={{ fontSize: 9, letterSpacing: '0.15em', color: 'var(--dim)' }}>NIFTY 50 · LTP</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <span className="mono" style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--fg)' }}>
                {fmt(LTP)}
              </span>
              <ChangeText pts={change} pct={changePct} />
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div className="mono" style={{ fontSize: 9, color: 'var(--dim)' }}>OPEN {fmt(TODAY_OPEN)}</div>
            <div className="mono" style={{ fontSize: 9, color: 'var(--dim)' }}>HIGH {fmt(Math.max(...CANDLES.map(c => c.h)))}</div>
            <div className="mono" style={{ fontSize: 9, color: 'var(--dim)' }}>LOW  {fmt(Math.min(...CANDLES.map(c => c.l)))}</div>
          </div>
          <div style={{ width: 90, height: 32 }}>
            <Spark data={CANDLES.slice(-60).map(c => c.c)} w={90} h={32} color={up ? "var(--green)" : "var(--red)"} fill />
          </div>
        </div>

        {/* Tabs */}
        <nav style={{ marginLeft: 'auto', display: 'flex', gap: 4, alignItems: 'center' }}>
          {[
            ["live", "Live"],
            ["backtest", "Backtest"],
            ["premarket", "Pre-Market"],
            ["screener", "Screener"],
            ["macro", "Macro"],
          ].map(([id, label]) => (
            <button
              key={id}
              className={"tab " + (tab === id ? "active" : "")}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </nav>

        {/* Right: status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="chip green"><span className="dot" />MKT OPEN · {t}</div>
          <div className="chip cyan">WS · 5,824 ticks</div>
          <button className="btn icon tooltip" data-tip="Search (⌘K)">⌕</button>
          <button className="btn icon tooltip" data-tip="Notifications">⌃</button>
          <button className="btn icon tooltip" data-tip="Settings">⚙</button>
          <div style={{
            width: 28, height: 28, borderRadius: 4, background: 'var(--panel-2)',
            border: '1px solid var(--hairline)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--cyan)'
          }}>SV</div>
        </div>
      </div>

      {/* Ticker tape */}
      <div style={{
        height: 28, borderTop: '1px solid var(--hairline-soft)',
        overflow: 'hidden', position: 'relative', display: 'flex', alignItems: 'center'
      }}
        className="marquee-pause"
      >
        <div style={{
          position: 'absolute', left: 0, top: 0, bottom: 0, width: 90,
          background: 'var(--panel-2)', borderRight: '1px solid var(--hairline)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '0.15em', color: 'var(--cyan)', zIndex: 2
        }}>
          ◉ LIVE TAPE
        </div>
        <div style={{ paddingLeft: 100, overflow: 'hidden', flex: 1 }}>
          <div className="marquee">
            {[...GLOBAL_MARKETS, ...GLOBAL_MARKETS].map((m, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '0 18px',
                borderRight: '1px solid var(--hairline-soft)',
                fontFamily: 'var(--mono)', fontSize: 11, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap'
              }}>
                <span style={{ color: 'var(--dim)' }}>{m.sym}</span>
                <span style={{ color: 'var(--fg-2)' }}>{fmt(m.px)}</span>
                <span className={m.chg >= 0 ? "up" : "down"} style={{ fontSize: 10 }}>{fmtPct(m.chg)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </header>
  );
}

window.Header = Header;
