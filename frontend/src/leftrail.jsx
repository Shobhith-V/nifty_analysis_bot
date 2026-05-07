function LeftRail() {
  const tools = [
    { id: 'cross', label: 'Crosshair', icon: '✛', active: true },
    { id: 'trend', label: 'Trend Line', icon: '╱' },
    { id: 'horiz', label: 'Horizontal', icon: '━' },
    { id: 'rect', label: 'Rectangle', icon: '▭' },
    { id: 'fib', label: 'Fibonacci', icon: 'φ' },
    { id: 'ray', label: 'Ray', icon: '→' },
    { id: 'note', label: 'Annotation', icon: 'A' },
    { id: 'measure', label: 'Measure', icon: '⊟' },
  ];
  const indicators = [
    { id: 'vwap', label: 'VWAP', on: true },
    { id: 'ema9', label: 'EMA 9', on: true },
    { id: 'ema21', label: 'EMA 21', on: true },
    { id: 'ema50', label: 'EMA 50', on: false },
    { id: 'cpr', label: 'CPR', on: true },
    { id: 'orb', label: 'ORB-15', on: true },
    { id: 'rsi', label: 'RSI 14', on: true },
    { id: 'macd', label: 'MACD', on: true },
    { id: 'bb', label: 'Bollinger', on: false },
    { id: 'vp', label: 'Volume Profile', on: false },
  ];

  return (
    <aside style={{
      width: 56, flexShrink: 0,
      background: 'var(--panel)',
      borderRight: '1px solid var(--hairline)',
      display: 'flex', flexDirection: 'column',
      padding: '8px 0', gap: 2,
    }}>
      <div className="mono" style={{
        fontSize: 8, letterSpacing: '0.2em', color: 'var(--dim-2)',
        textAlign: 'center', padding: '4px 0', borderBottom: '1px solid var(--hairline-soft)', marginBottom: 4
      }}>
        TOOLS
      </div>
      {tools.map(t => (
        <button key={t.id} className={"btn icon tooltip " + (t.active ? "active" : "")}
          data-tip={t.label}
          style={{
            margin: '0 8px', height: 32, width: 'auto', borderRadius: 3,
            fontFamily: 'var(--mono)', fontSize: 14
          }}>
          {t.icon}
        </button>
      ))}
      <div className="mono" style={{
        fontSize: 8, letterSpacing: '0.2em', color: 'var(--dim-2)',
        textAlign: 'center', padding: '8px 0 4px', borderTop: '1px solid var(--hairline-soft)',
        marginTop: 6, borderBottom: '1px solid var(--hairline-soft)', marginBottom: 4
      }}>
        IND
      </div>
      {indicators.slice(0, 6).map(i => (
        <button key={i.id} className={"btn tooltip " + (i.on ? "active" : "")}
          data-tip={i.label}
          style={{
            margin: '0 8px', height: 26, padding: 0,
            fontFamily: 'var(--mono)', fontSize: 9, justifyContent: 'center'
          }}>
          {i.label}
        </button>
      ))}
      <button className="btn tooltip" data-tip="Add indicator..."
        style={{
          margin: '6px 8px 0', height: 26, padding: 0,
          fontFamily: 'var(--mono)', fontSize: 14, justifyContent: 'center',
          color: 'var(--cyan)', borderStyle: 'dashed'
        }}>
        +
      </button>

      <div style={{ flex: 1 }} />
      <button className="btn icon tooltip" data-tip="Save layout"
        style={{ margin: '0 8px 4px', height: 30 }}>
        ⎙
      </button>
      <button className="btn icon tooltip" data-tip="Take snapshot"
        style={{ margin: '0 8px 4px', height: 30 }}>
        ⌘
      </button>
    </aside>
  );
}

window.LeftRail = LeftRail;
