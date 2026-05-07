function LeftRail() {
  const [activeTool, setActiveTool] = React.useState('cross');
  const [indicators, setIndicators] = React.useState(() => window.__indicators || {
    vwap: true, ema9: true, ema21: true, ema50: false,
    cpr: true, orb: true, rsi: true, macd: true, bb: false, vp: false,
  });

  // Sync to global so the chart can read
  React.useEffect(() => {
    window.__indicators = indicators;
    document.dispatchEvent(new CustomEvent('indicators-changed', { detail: indicators }));
  }, [indicators]);

  const toggleInd = (id) => setIndicators(prev => ({ ...prev, [id]: !prev[id] }));

  const tools = [
    { id: 'cross', label: 'Crosshair', icon: '✛' },
    { id: 'trend', label: 'Trend Line', icon: '╱' },
    { id: 'horiz', label: 'Horizontal', icon: '━' },
    { id: 'rect', label: 'Rectangle', icon: '▭' },
    { id: 'fib', label: 'Fibonacci', icon: 'φ' },
    { id: 'ray', label: 'Ray', icon: '→' },
    { id: 'note', label: 'Annotation', icon: 'A' },
    { id: 'measure', label: 'Measure', icon: '⊟' },
  ];
  const indList = [
    { id: 'vwap', label: 'VWAP' },
    { id: 'ema9', label: 'EMA 9' },
    { id: 'ema21', label: 'EMA 21' },
    { id: 'ema50', label: 'EMA 50' },
    { id: 'cpr', label: 'CPR' },
    { id: 'orb', label: 'ORB-15' },
  ];

  return (
    <aside style={{
      width: 56, flexShrink: 0,
      background: 'var(--panel)',
      borderRight: '1px solid var(--hairline)',
      display: 'flex', flexDirection: 'column',
      padding: '8px 0', gap: 2,
      overflow: 'hidden auto'
    }}>
      <div className="mono" style={{
        fontSize: 8, letterSpacing: '0.2em', color: 'var(--dim-2)',
        textAlign: 'center', padding: '4px 0', borderBottom: '1px solid var(--hairline-soft)', marginBottom: 4
      }}>
        TOOLS
      </div>
      {tools.map(t => (
        <button key={t.id} className={"btn icon tooltip " + (activeTool === t.id ? "active" : "")}
          data-tip={t.label}
          onClick={() => setActiveTool(t.id)}
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
      {indList.map(i => (
        <button key={i.id} className={"btn tooltip " + (indicators[i.id] ? "active" : "")}
          data-tip={`${i.label} · click to toggle`}
          onClick={() => toggleInd(i.id)}
          style={{
            margin: '0 8px', height: 26, padding: 0,
            fontFamily: 'var(--mono)', fontSize: 9, justifyContent: 'center'
          }}>
          {i.label}
        </button>
      ))}
      <button className="btn tooltip"
        data-tip="Add indicator"
        onClick={() => window._toast && window._toast('Indicator picker — coming soon')}
        style={{
          margin: '6px 8px 0', height: 26, padding: 0,
          fontFamily: 'var(--mono)', fontSize: 14, justifyContent: 'center',
          color: 'var(--cyan)', borderStyle: 'dashed'
        }}>
        +
      </button>

      <div style={{ flex: 1, minHeight: 8 }} />
      <button className="btn icon tooltip"
        data-tip="Save layout"
        onClick={() => {
          try {
            localStorage.setItem('nifty-layout', JSON.stringify({ indicators, activeTool, ts: Date.now() }));
            window._toast && window._toast('Layout saved');
          } catch (e) { window._toast && window._toast('Save failed'); }
        }}
        style={{ margin: '0 8px 4px', height: 30 }}>
        ⎙
      </button>
      <button className="btn icon tooltip"
        data-tip="Take snapshot"
        onClick={() => window._toast && window._toast('Snapshot copied (demo)')}
        style={{ margin: '0 8px 4px', height: 30 }}>
        ⌘
      </button>
    </aside>
  );
}

window.LeftRail = LeftRail;
