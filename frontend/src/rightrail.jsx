function RightRail() {
  const change = LTP - PREV_CLOSE;
  const changePct = (change / PREV_CLOSE) * 100;
  const pricePos = LTP > CPR_DAILY.tc ? "ABOVE_CPR" : LTP < CPR_DAILY.bc ? "BELOW_CPR" : "INSIDE_CPR";
  const cprWidth = CPR_DAILY.tc - CPR_DAILY.bc;
  const cprPct = (cprWidth / CPR_DAILY.pivot) * 100;
  const cprType = cprPct < 0.1 ? "VERY NARROW" : cprPct < 0.2 ? "NARROW" : cprPct < 0.4 ? "MODERATE" : "WIDE";

  return (
    <aside style={{
      width: 300, flexShrink: 0,
      borderLeft: '1px solid var(--hairline)',
      display: 'flex', flexDirection: 'column',
      gap: 8, padding: 8,
      overflow: 'auto',
      background: 'var(--bg)'
    }}>
      {/* BIAS DIAL */}
      <div className="panel">
        <div className="panel-h">
          <div className="lhs"><span className="num">01</span><span>Today's Bias</span></div>
          <div className="rhs"><span className="dot" />LIVE</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 12px' }}>
          <Gauge value={BIAS_SCORE} max={10} label="SCORE" sublabel={BIAS_LABEL} color="var(--green)" />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div className="kv"><span className="k">Confidence</span><span className="v" style={{ color: 'var(--green)' }}>64%</span></div>
            <div className="bar green"><span style={{ width: '64%' }} /></div>
            <div className="kv"><span className="k">Volatility</span><span className="v">Mod.</span></div>
            <div className="kv"><span className="k">Regime</span><span className="v" style={{ color: 'var(--cyan)' }}>Trend</span></div>
            <div style={{ marginTop: 6, padding: '6px 8px', background: 'var(--bg-2)', border: '1px solid var(--hairline-soft)', borderRadius: 3 }}>
              <div className="mono" style={{ fontSize: 9, color: 'var(--dim)' }}>FACTORS</div>
              <div className="mono" style={{ fontSize: 10, color: 'var(--fg-2)', lineHeight: 1.6, marginTop: 3 }}>
                <div><span className="up">●</span> Above CPR <span className="up">+2</span></div>
                <div><span className="up">●</span> Above VWAP <span className="up">+1</span></div>
                <div><span className="up">●</span> RSI 58 <span className="up">+1</span></div>
                <div><span className="up">●</span> GIFT +0.31% <span className="up">+1</span></div>
                <div><span style={{ color: 'var(--dim)' }}>●</span> Narrow CPR <span style={{ color: 'var(--dim)' }}>0</span></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* CPR PANEL */}
      <div className="panel">
        <div className="panel-h">
          <div className="lhs"><span className="num">02</span><span>CPR · Daily</span></div>
          <div className="rhs">
            <Chip tone="cyan">{cprType}</Chip>
            <Chip>VIRGIN</Chip>
          </div>
        </div>
        <div style={{ padding: '8px 0' }}>
          {[
            ['R3', CPR_DAILY.r3, 'var(--red)'],
            ['R2', CPR_DAILY.r2, 'var(--red)'],
            ['R1', CPR_DAILY.r1, 'var(--red)'],
            ['TC', CPR_DAILY.tc, 'var(--cyan)'],
            ['Pivot', CPR_DAILY.pivot, 'var(--cyan)'],
            ['BC', CPR_DAILY.bc, 'var(--cyan)'],
            ['S1', CPR_DAILY.s1, 'var(--green)'],
            ['S2', CPR_DAILY.s2, 'var(--green)'],
            ['S3', CPR_DAILY.s3, 'var(--green)'],
          ].map(([k, v, col], i) => {
            const isPivot = k === 'Pivot' || k === 'TC' || k === 'BC';
            const dist = LTP - v;
            return (
              <div key={k} style={{
                display: 'grid', gridTemplateColumns: '36px 1fr 70px 56px',
                alignItems: 'center', padding: '4px 12px', gap: 8,
                background: isPivot ? 'oklch(0.80 0.14 220 / 0.05)' : 'transparent',
                borderTop: i === 3 || i === 6 ? '1px dashed var(--hairline-soft)' : 'none'
              }}>
                <span className="mono" style={{ fontSize: 10, color: col, fontWeight: isPivot ? 600 : 400 }}>{k}</span>
                <div style={{ position: 'relative', height: 4, background: 'var(--hairline-soft)', borderRadius: 1 }}>
                  <div style={{
                    position: 'absolute', left: 0, top: 0, bottom: 0,
                    width: `${Math.min(100, Math.max(0, ((v - 24700) / 200) * 100))}%`,
                    background: col, opacity: 0.6
                  }} />
                </div>
                <span className="mono" style={{ fontSize: 11, color: 'var(--fg)', textAlign: 'right' }}>{fmt(v)}</span>
                <span className="mono" style={{ fontSize: 10, color: dist >= 0 ? 'var(--green)' : 'var(--red)', textAlign: 'right' }}>
                  {fmtPts(dist, 1)}
                </span>
              </div>
            );
          })}
        </div>
        <div style={{ padding: '8px 12px', borderTop: '1px solid var(--hairline-soft)', background: 'var(--bg-2)' }}>
          <div className="mono" style={{ fontSize: 9, color: 'var(--dim)', marginBottom: 3 }}>POSITION</div>
          <div className="mono" style={{ fontSize: 11, color: 'var(--green)' }}>
            ▲ {pricePos.replace('_', ' ')} · width {cprPct.toFixed(3)}%
          </div>
        </div>
      </div>

      {/* GAP / ORB */}
      <div className="panel">
        <div className="panel-h">
          <div className="lhs"><span className="num">03</span><span>Gap & ORB</span></div>
        </div>
        <div style={{ padding: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <div className="mono" style={{ fontSize: 9, color: 'var(--dim)' }}>GAP</div>
            <div className="mono" style={{
              fontSize: 18, fontWeight: 600,
              color: GAP_PTS >= 0 ? 'var(--green)' : 'var(--red)'
            }}>
              {fmtPts(GAP_PTS, 1)}
            </div>
            <div className="mono" style={{ fontSize: 10, color: 'var(--dim)' }}>
              {fmtPct(GAP_PCT)} · {GAP_PTS >= 0 ? 'GAP UP' : 'GAP DOWN'}
            </div>
            <div className="bar amber" style={{ marginTop: 6 }}><span style={{ width: '64%' }} /></div>
            <div className="mono" style={{ fontSize: 9, color: 'var(--dim)', marginTop: 3 }}>FILLED 64%</div>
          </div>
          <div>
            <div className="mono" style={{ fontSize: 9, color: 'var(--dim)' }}>ORB-15</div>
            <div className="mono" style={{ fontSize: 11, color: 'var(--fg)' }}>H {fmt(ORB_15.high)}</div>
            <div className="mono" style={{ fontSize: 11, color: 'var(--fg-2)' }}>L {fmt(ORB_15.low)}</div>
            <div className="mono" style={{ fontSize: 10, color: 'var(--green)', marginTop: 6 }}>▲ BREAKOUT</div>
            <div className="mono" style={{ fontSize: 9, color: 'var(--dim)' }}>Vol confirmed (1.8×)</div>
          </div>
        </div>
      </div>

      {/* SIGNALS */}
      <div className="panel">
        <div className="panel-h">
          <div className="lhs"><span className="num">04</span><span>Signals</span></div>
          <div className="rhs"><span>{SIGNALS.length} today</span></div>
        </div>
        <div style={{ maxHeight: 200, overflow: 'auto' }}>
          {SIGNALS.slice(0, 6).map((s, i) => {
            const col = s.dir === 'BULLISH' ? 'var(--green)' : s.dir === 'BEARISH' ? 'var(--red)' : 'var(--amber)';
            return (
              <div key={i} style={{
                display: 'grid', gridTemplateColumns: '40px 1fr auto',
                gap: 8, alignItems: 'center', padding: '6px 10px',
                borderTop: i === 0 ? 'none' : '1px solid var(--hairline-soft)'
              }}>
                <span className="mono" style={{ fontSize: 10, color: 'var(--dim)' }}>{s.t}</span>
                <div>
                  <div className="mono" style={{ fontSize: 11, color: col }}>{s.type}</div>
                  <div className="mono" style={{ fontSize: 10, color: 'var(--dim)' }}>{s.desc}</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
                  <span className="mono" style={{ fontSize: 10, color: 'var(--fg-2)' }}>{fmt(s.px)}</span>
                  <div style={{ display: 'flex', gap: 1 }}>
                    {Array.from({ length: 5 }).map((_, k) => (
                      <span key={k} style={{
                        width: 4, height: 4, borderRadius: 0.5,
                        background: k < s.conf ? col : 'var(--hairline)'
                      }} />
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* INDICATORS readout */}
      <div className="panel">
        <div className="panel-h">
          <div className="lhs"><span className="num">05</span><span>Indicators</span></div>
        </div>
        <div style={{ padding: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px' }}>
          <div className="kv"><span className="k">VWAP</span><span className="v">{fmt(VWAP)}</span></div>
          <div className="kv"><span className="k">RSI 14</span><span className="v" style={{ color: 'var(--cyan)' }}>{RSI_NOW.toFixed(1)}</span></div>
          <div className="kv"><span className="k">EMA 9</span><span className="v">{fmt(EMA9[EMA9.length-1])}</span></div>
          <div className="kv"><span className="k">EMA 21</span><span className="v">{fmt(EMA21[EMA21.length-1])}</span></div>
          <div className="kv"><span className="k">EMA 50</span><span className="v">{fmt(EMA50[EMA50.length-1])}</span></div>
          <div className="kv"><span className="k">MACD</span><span className="v" style={{ color: 'var(--green)' }}>{MACD_HIST[MACD_HIST.length-1].toFixed(2)}</span></div>
        </div>
      </div>
    </aside>
  );
}

window.RightRail = RightRail;
