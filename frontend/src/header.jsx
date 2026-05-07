function Header({ tab, setTab, t, onRefresh, refreshing }) {
  const change = LTP - PREV_CLOSE;
  const changePct = (change / PREV_CLOSE) * 100;
  const up = change >= 0;
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [notifOpen, setNotifOpen] = React.useState(false);

  const tabs = [
    ["live", "Live"],
    ["backtest", "Backtest"],
    ["premarket", "Pre-Market"],
    ["news", "News"],
    ["polymarket", "Polymarket"],
    ["screener", "Screener"],
    ["macro", "Macro"],
  ];

  const openSettings = () => {
    // Toggle the Tweaks panel
    window.parent && window.parent.postMessage({ type: '__activate_edit_mode' }, '*');
    window._toast && window._toast('Tweaks panel toggled — use the toolbar Tweaks switch');
  };

  return (
    <header style={{
      flexShrink: 0,
      borderBottom: '1px solid var(--hairline)',
      background: 'linear-gradient(to bottom, var(--panel), var(--bg-2))',
    }}>
      {/* Top row */}
      <div style={{
        display: 'flex', alignItems: 'center', minHeight: 56, padding: '0 12px', gap: 16,
        flexWrap: 'wrap'
      }}>
        <div className="brand" style={{ flexShrink: 0 }}>
          <span className="mark">Nifty</span>
          <span className="mark" style={{ color: 'var(--cyan)', fontStyle: 'italic' }}>Quant</span>
          <span className="sub">/ Lab v2.4</span>
        </div>

        <div className="vr" style={{ height: 32, flexShrink: 0 }} />

        {/* Live LTP block */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
          <div>
            <div className="mono" style={{ fontSize: 9, letterSpacing: '0.15em', color: 'var(--dim)' }}>NIFTY 50 · LTP</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
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
          <div style={{ width: 80, height: 32 }}>
            <Spark data={CANDLES.slice(-60).map(c => c.c)} w={80} h={32} color={up ? "var(--green)" : "var(--red)"} fill />
          </div>
        </div>

        {/* Tabs */}
        <nav style={{
          marginLeft: 'auto', display: 'flex', gap: 2, alignItems: 'center',
          flexWrap: 'wrap', justifyContent: 'flex-end'
        }}>
          {tabs.map(([id, label]) => (
            <button
              key={id}
              className={"tab " + (tab === id ? "active" : "")}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </nav>

        {/* Right: status + actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <div className="chip green"><span className="dot" />MKT · {t}</div>
          <button
            className="btn icon tooltip"
            data-tip={refreshing ? 'Refreshing…' : 'Refresh now'}
            onClick={onRefresh}
            disabled={refreshing}
            style={{ opacity: refreshing ? 0.5 : 1 }}
          >
            <span style={{ display: 'inline-block', animation: refreshing ? 'spin 0.8s linear infinite' : 'none' }}>⟳</span>
          </button>
          <button
            className={"btn icon tooltip " + (searchOpen ? "active" : "")}
            data-tip="Search (⌘K)"
            onClick={() => { setSearchOpen(o => !o); setNotifOpen(false); }}
          >⌕</button>
          <button
            className={"btn icon tooltip " + (notifOpen ? "active" : "")}
            data-tip="Notifications"
            onClick={() => { setNotifOpen(o => !o); setSearchOpen(false); }}
          >⌃</button>
          <button
            className="btn icon tooltip"
            data-tip="Settings · Tweaks"
            onClick={openSettings}
          >⚙</button>
          <div style={{
            width: 28, height: 28, borderRadius: 4, background: 'var(--panel-2)',
            border: '1px solid var(--hairline)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--cyan)'
          }}>SV</div>
        </div>
      </div>

      {/* Search dropdown */}
      {searchOpen && (
        <div style={{
          position: 'absolute', right: 16, top: 56, zIndex: 50, width: 320,
          background: 'var(--panel-2)', border: '1px solid var(--hairline)', borderRadius: 4,
          padding: 8, boxShadow: '0 12px 28px oklch(0 0 0 / 0.5)'
        }}>
          <input
            autoFocus
            placeholder="Search symbols, signals, news…"
            onKeyDown={e => { if (e.key === 'Escape') setSearchOpen(false); }}
            style={{
              width: '100%', height: 32, background: 'var(--bg)', border: '1px solid var(--hairline)',
              borderRadius: 3, padding: '0 10px', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--fg)'
            }}
          />
          <div className="mono" style={{ fontSize: 9, color: 'var(--dim)', marginTop: 6 }}>
            ⌘K to open · Esc to close · Demo only
          </div>
        </div>
      )}

      {/* Notif dropdown */}
      {notifOpen && (
        <div style={{
          position: 'absolute', right: 50, top: 56, zIndex: 50, width: 320,
          background: 'var(--panel-2)', border: '1px solid var(--hairline)', borderRadius: 4,
          boxShadow: '0 12px 28px oklch(0 0 0 / 0.5)'
        }}>
          <div className="panel-h"><div className="lhs"><span>Notifications</span></div><div className="rhs">{SIGNALS.length}</div></div>
          <div style={{ maxHeight: 280, overflow: 'auto' }}>
            {SIGNALS.slice(0, 5).map((s, i) => {
              const col = s.dir === 'BULLISH' ? 'var(--green)' : s.dir === 'BEARISH' ? 'var(--red)' : 'var(--amber)';
              return (
                <div key={i} style={{ padding: '8px 10px', borderTop: i ? '1px solid var(--hairline-soft)' : 'none' }}>
                  <div className="mono" style={{ fontSize: 10, color: col }}>{s.type}</div>
                  <div className="mono" style={{ fontSize: 10, color: 'var(--dim)' }}>{s.t} · {fmt(s.px)}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

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
