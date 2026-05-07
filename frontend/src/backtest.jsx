function Backtest() {
  const [result, setResult] = React.useState(null);
  const [running, setRunning] = React.useState(false);
  const [dslText, setDslText] = React.useState(DSL_TEXT);
  const [errMsg, setErrMsg] = React.useState(null);
  const API_BASE = (window.location.port === '8000' || window.location.port === '') ? '' : 'http://localhost:8000';

  const runBacktest = async () => {
    setRunning(true); setErrMsg(null);
    try {
      const res = await fetch(`${API_BASE}/api/backtest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dsl: dslText, days: 60, capital: 100000 }),
      }).then(r => r.json());
      if (res.error) { setErrMsg(res.error); } else { setResult(res); }
    } catch (e) {
      setErrMsg('Backend unreachable — run ./start.sh first');
    }
    setRunning(false);
  };

  // Use live result or fall back to static mock
  const stats = result ? result.stats : BACKTEST;
  const eq = result ? result.equity_curve.map((e,i) => ({ d: i, v: e.equity })) : BACKTEST.equity;
  const tradeLog = result ? result.trades : null;
  const W = 720, H = 200;
  const min = Math.min(...eq.map(p => p.v));
  const max = Math.max(...eq.map(p => p.v));
  const span = max - min;
  const path = eq.map((p, i) => {
    const x = (i / (eq.length - 1)) * W;
    const y = H - ((p.v - min) / span) * (H - 10) - 5;
    return (i === 0 ? "M" : "L") + x.toFixed(1) + "," + y.toFixed(1);
  }).join(" ");
  const fill = path + ` L${W},${H} L0,${H} Z`;

  return (
    <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '320px 1fr 320px', gap: 10, padding: 10, minHeight: 0 }}>
      {/* Left: Strategy DSL editor */}
      <div className="panel" style={{ display: 'flex', flexDirection: 'column' }}>
        <div className="panel-h">
          <div className="lhs"><span className="num">DSL</span><span>Strategy Rules</span></div>
          <div className="rhs"><Chip tone="cyan">v3.2</Chip></div>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: 0, position: 'relative' }}>
          <textarea
            value={dslText}
            onChange={e => setDslText(e.target.value)}
            spellCheck={false}
            style={{
              width: '100%', height: '100%', margin: 0, padding: 10,
              fontFamily: 'var(--mono)', fontSize: 11,
              color: 'var(--fg-2)', lineHeight: 1.55,
              background: 'transparent', border: 'none', resize: 'none',
              outline: 'none', boxSizing: 'border-box',
            }}
          />
        </div>
        {errMsg && (
          <div style={{ padding: '4px 10px', background: 'oklch(0.68 0.20 27 / 0.15)', borderTop: '1px solid var(--hairline)' }}>
            <span className="mono" style={{ fontSize: 10, color: 'var(--red)' }}>⚠ {errMsg}</span>
          </div>
        )}
        <div style={{ padding: 8, borderTop: '1px solid var(--hairline)', display: 'flex', gap: 6 }}>
          <button className="btn primary sm" style={{ flex: 1, justifyContent: 'center' }}
            onClick={runBacktest} disabled={running}>
            {running ? '⟳ Running…' : '▶ Run Backtest'}
          </button>
          <button className="btn sm" onClick={() => { setResult(null); setErrMsg(null); }}>Reset</button>
        </div>
      </div>

      {/* Center: Equity curve + trade log */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0 }}>
        <div className="panel" style={{ flexShrink: 0 }}>
          <div className="panel-h">
            <div className="lhs"><span className="num">EQ</span><span>Equity Curve</span></div>
            <div className="rhs">
              <Chip tone={stats.net_return_pct >= 0 ? 'green' : 'red'}>
                {stats.net_return_pct != null ? `${stats.net_return_pct >= 0 ? '+' : ''}${stats.net_return_pct}%` : `+${BACKTEST.netReturn}%`}
              </Chip>
              <span>{stats.period || BACKTEST.period}</span>
            </div>
          </div>
          <div style={{ padding: 8 }}>
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: H }}>
              <defs>
                <linearGradient id="eqg" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0" stopColor="var(--green)" stopOpacity="0.45" />
                  <stop offset="1" stopColor="var(--green)" stopOpacity="0" />
                </linearGradient>
              </defs>
              {/* gridlines */}
              {[0.25, 0.5, 0.75].map(g => (
                <line key={g} x1="0" x2={W} y1={H*g} y2={H*g} stroke="var(--hairline-soft)" strokeWidth="0.5" strokeDasharray="2 4" />
              ))}
              <path d={fill} fill="url(#eqg)" />
              <path d={path} fill="none" stroke="var(--green)" strokeWidth="1.4" />
              {/* benchmark */}
              <path d={eq.map((p, i) => {
                const x = (i / (eq.length - 1)) * W;
                const y = H - ((100000 + i * 320 - min) / span) * (H - 10) - 5;
                return (i === 0 ? "M" : "L") + x.toFixed(1) + "," + y.toFixed(1);
              }).join(" ")} fill="none" stroke="var(--dim)" strokeWidth="1" strokeDasharray="3 3" />
            </svg>
          </div>
        </div>

        {/* Trade log */}
        <div className="panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div className="panel-h">
            <div className="lhs"><span className="num">TR</span><span>Trade Log</span></div>
            <div className="rhs"><span>{stats.trades || BACKTEST.trades} trades</span></div>
          </div>
          <div style={{ flex: 1, overflow: 'auto' }}>
            <table className="tbl">
              <thead><tr>
                <th>#</th><th>DATE</th><th>SIDE</th><th>SIGNAL</th>
                <th className="right">ENTRY</th><th className="right">EXIT</th>
                <th className="right">P&L</th><th className="right">R</th>
              </tr></thead>
              <tbody>
                {(tradeLog || [
                  {num:248, date:'06 May', direction:'L', signal:'VWAP_RECLAIM_LONG', entry:24812.20, exit:24856.40, pnl:44.20, r_multiple:1.8},
                  {num:247, date:'06 May', direction:'S', signal:'CPR_BREAKDOWN', entry:24798.10, exit:24812.05, pnl:-13.95, r_multiple:-0.6},
                  {num:246, date:'05 May', direction:'L', signal:'ORB_BREAKOUT', entry:24691.50, exit:24742.80, pnl:51.30, r_multiple:2.1},
                  {num:245, date:'05 May', direction:'L', signal:'BULLISH_ENGULFING', entry:24655.20, exit:24682.10, pnl:26.90, r_multiple:1.1},
                  {num:244, date:'03 May', direction:'S', signal:'BEARISH_ENGULFING', entry:24770.40, exit:24749.80, pnl:20.60, r_multiple:0.9},
                ]).map(r => (
                  <tr key={r.num}>
                    <td style={{ color: 'var(--dim)' }}>#{r.num}</td>
                    <td>{r.date}</td>
                    <td><span style={{ color: r.direction === 'L' ? 'var(--green)' : 'var(--red)' }}>{r.direction === 'L' ? 'LONG' : 'SHORT'}</span></td>
                    <td style={{ color: 'var(--cyan)' }}>{r.signal}</td>
                    <td className="right">{fmt(r.entry)}</td>
                    <td className="right">{fmt(r.exit)}</td>
                    <td className={"right " + (r.pnl >= 0 ? 'up' : 'down')}>{fmtPts(r.pnl, 1)}</td>
                    <td className={"right " + (r.r_multiple >= 0 ? 'up' : 'down')}>{Number(r.r_multiple).toFixed(1)}R</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Right: stats panel */}
      <div className="panel" style={{ display: 'flex', flexDirection: 'column' }}>
        <div className="panel-h">
          <div className="lhs"><span className="num">μ²</span><span>Performance</span></div>
        </div>
        <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div className="mono" style={{ fontSize: 9, letterSpacing: '0.15em', color: 'var(--dim)' }}>NET RETURN</div>
            <div className="mono" style={{ fontSize: 28, color: (stats.net_return_pct ?? BACKTEST.netReturn) >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 600, lineHeight: 1 }}>
              {stats.net_return_pct != null ? `${stats.net_return_pct >= 0 ? '+' : ''}${stats.net_return_pct}%` : `+${BACKTEST.netReturn}%`}
            </div>
            <div className="mono" style={{ fontSize: 10, color: 'var(--dim)' }}>{stats.strategy || BACKTEST.strategy}</div>
          </div>

          {[
            ['Sharpe', (stats.sharpe ?? BACKTEST.sharpe).toFixed(2), 'var(--cyan)'],
            ['Win Rate', (stats.win_rate ?? BACKTEST.winRate) + '%', 'var(--green)'],
            ['Profit Factor', (stats.profit_factor ?? BACKTEST.profitFactor).toFixed(2), 'var(--green)'],
            ['Avg Win', '+' + (stats.avg_win_pct ?? BACKTEST.avgWin) + '%', 'var(--green)'],
            ['Avg Loss', (stats.avg_loss_pct ?? BACKTEST.avgLoss) + '%', 'var(--red)'],
            ['Max DD', '-' + (stats.max_drawdown_pct ?? Math.abs(BACKTEST.maxDD)) + '%', 'var(--red)'],
            ['Trades', stats.trades ?? BACKTEST.trades, 'var(--fg)'],
            ['Period', stats.period || BACKTEST.period, 'var(--fg)'],
          ].map(([k, v, col]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
              padding: '6px 0', borderBottom: '1px solid var(--hairline-soft)' }}>
              <span className="mono" style={{ fontSize: 10, letterSpacing: '0.05em', color: 'var(--dim)' }}>{k}</span>
              <span className="mono" style={{ fontSize: 13, color: col, fontWeight: 500 }}>{v}</span>
            </div>
          ))}

          <div style={{ marginTop: 'auto', padding: '8px 10px', background: 'var(--bg-2)', border: '1px solid var(--hairline-soft)', borderRadius: 3 }}>
            <div className="mono" style={{ fontSize: 9, color: 'var(--dim)', marginBottom: 4 }}>MONTHLY HEATMAP</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 2 }}>
              {[2.1, -0.8, 1.4, 3.2, 0.6, 2.8, 1.1, -1.2, 0.4, 4.1, 2.6, 1.8].map((v, i) => (
                <div key={i} className="mono" style={{
                  fontSize: 9, padding: '6px 0', textAlign: 'center', borderRadius: 1,
                  background: v >= 0 ? `oklch(0.74 0.16 145 / ${0.15 + Math.min(0.5, v / 8)})` : `oklch(0.68 0.20 27 / ${0.15 + Math.min(0.5, -v / 4)})`,
                  color: v >= 0 ? 'var(--green)' : 'var(--red)'
                }}>{v >= 0 ? '+' : ''}{v.toFixed(1)}</div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

window.Backtest = Backtest;
