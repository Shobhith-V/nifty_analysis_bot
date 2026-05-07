const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accent": "cyan",
  "density": "comfortable",
  "showAI": true,
  "showTicker": true
}/*EDITMODE-END*/;

function App() {
  const [tab, setTab] = React.useState('live');
  const [t, setT] = React.useState(() => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')} IST`;
  });
  const [tweaks, setTweak] = (typeof useTweaks !== 'undefined')
    ? useTweaks(TWEAK_DEFAULTS)
    : [TWEAK_DEFAULTS, () => {}];

  const [dataVersion, setDataVersion] = React.useState(0);
  const [toast, setToast] = React.useState(null);

  React.useEffect(() => {
    const bump = () => setDataVersion(v => v + 1);
    // Tick updates handled locally inside Chart — no global re-render on each tick.
    // App re-renders on candle close (new bar finalized) and data-ready (initial load).
    document.addEventListener('nifty-data-ready', bump);
    document.addEventListener('nifty-candle',     bump);
    document.addEventListener('nifty-news-ready', bump);
    document.addEventListener('nifty-poly-ready', bump);
    return () => {
      document.removeEventListener('nifty-data-ready', bump);
      document.removeEventListener('nifty-candle',     bump);
      document.removeEventListener('nifty-news-ready', bump);
      document.removeEventListener('nifty-poly-ready', bump);
    };
  }, []);

  React.useEffect(() => {
    const id = window.setInterval(() => {
      const d = new Date();
      setT(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')} IST`);
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  React.useEffect(() => {
    const map = {
      cyan: 'oklch(0.80 0.14 220)',
      green: 'oklch(0.74 0.16 145)',
      violet: 'oklch(0.74 0.16 295)',
      amber: 'oklch(0.82 0.15 80)',
    };
    document.documentElement.style.setProperty('--cyan', map[tweaks.accent] || map.cyan);
  }, [tweaks.accent]);

  // Toast helper exposed globally for buttons across the app
  React.useEffect(() => {
    window._toast = (msg) => {
      setToast(msg);
      setTimeout(() => setToast(null), 1800);
    };
  }, []);

  const [refreshing, setRefreshing] = React.useState(false);
  const manualRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      if (window._niftyRefreshIndicators) await window._niftyRefreshIndicators();
      if (window._niftyRefreshAux) await window._niftyRefreshAux();
      window._toast && window._toast('Refreshed');
    } finally { setRefreshing(false); }
  };

  return (
    <div className="app-frame" data-v={dataVersion}>
      <Header tab={tab} setTab={setTab} t={t} onRefresh={manualRefresh} refreshing={refreshing} />
      <div style={{ flex: 1, display: 'flex', minHeight: 0, minWidth: 0 }}>
        {tab === 'live' && (
          <>
            <LeftRail />
            <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
              <div style={{ flex: 1, display: 'flex', minHeight: 0, minWidth: 0, padding: 8, gap: 8 }}>
                <Chart />
                <RightRail />
              </div>
              {tweaks.showAI && <BottomStrip />}
            </main>
          </>
        )}
        {tab === 'backtest' && <Backtest />}
        {tab === 'premarket' && <PreMarket />}
        {tab === 'news' && <NewsPage />}
        {tab === 'polymarket' && <PolymarketPage />}
        {(tab === 'screener' || tab === 'macro') && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8 }}>
            <div className="serif" style={{ fontSize: 28, fontStyle: 'italic', color: 'var(--dim)' }}>{tab === 'screener' ? 'Screener' : 'Macro'}</div>
            <div className="mono" style={{ fontSize: 11, color: 'var(--dim-2)' }}>Coming soon — placeholder</div>
          </div>
        )}
      </div>

      <footer style={{
        flexShrink: 0, height: 22, borderTop: '1px solid var(--hairline)',
        background: 'var(--panel)', display: 'flex', alignItems: 'center',
        padding: '0 12px', gap: 16, fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--dim)',
        whiteSpace: 'nowrap', overflow: 'hidden'
      }}>
        <span><span className="dot" /> ANGEL ONE · authenticated</span>
        <span>WS · live</span>
        <span>API · 12ms</span>
        <span>auto-refresh · 10s</span>
        <span style={{ marginLeft: 'auto', color: 'var(--amber)' }}>⚠ ANALYSIS ONLY — NO ORDERS</span>
        <span>v2.4.1</span>
      </footer>

      {toast && (
        <div style={{
          position: 'fixed', bottom: 36, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--panel-2)', border: '1px solid var(--cyan)',
          padding: '8px 14px', borderRadius: 4, zIndex: 1000,
          fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--cyan)',
          boxShadow: '0 8px 24px oklch(0 0 0 / 0.4)'
        }}>
          {toast}
        </div>
      )}

      {typeof TweaksPanel !== 'undefined' && (
        <TweaksPanel>
          <TweakSection title="Theme">
            <TweakRadio label="Accent" value={tweaks.accent} onChange={v => setTweak('accent', v)}
              options={[['cyan','Cyan'],['green','Green'],['violet','Violet'],['amber','Amber']]} />
            <TweakRadio label="Density" value={tweaks.density} onChange={v => setTweak('density', v)}
              options={[['compact','Compact'],['comfortable','Comfort']]} />
          </TweakSection>
          <TweakSection title="Layout">
            <TweakToggle label="AI commentary strip" value={tweaks.showAI} onChange={v => setTweak('showAI', v)} />
            <TweakToggle label="Live ticker tape" value={tweaks.showTicker} onChange={v => setTweak('showTicker', v)} />
          </TweakSection>
        </TweaksPanel>
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
