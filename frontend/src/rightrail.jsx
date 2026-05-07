function RightRail() {
  const ltp       = window.LTP        || LTP;
  const prevClose = window.PREV_CLOSE || PREV_CLOSE;
  const cpr       = window.CPR_DAILY  || CPR_DAILY;
  const orb       = window.ORB_15     || ORB_15;
  const vwap      = window.VWAP       || VWAP;
  const rsiNow    = window.RSI_NOW    || RSI_NOW;
  const ema9Last  = (window.EMA9  || EMA9).slice(-1)[0]  || 0;
  const ema21Last = (window.EMA21 || EMA21).slice(-1)[0] || 0;
  const ema50Last = (window.EMA50 || EMA50).slice(-1)[0] || 0;
  const macdH     = (window.MACD_HIST || MACD_HIST).slice(-1)[0] || 0;
  const signals   = window.SIGNALS    || SIGNALS;
  const gapPts    = window.GAP_PTS    || GAP_PTS;
  const gapPct    = window.GAP_PCT    || GAP_PCT;

  // Bias — fully live
  const biasLabel = window.BIAS_LABEL      || BIAS_LABEL;
  const biasScore = window.BIAS_SCORE      || BIAS_SCORE;
  const biasConf  = window.BIAS_CONFIDENCE ?? 0;
  const biasFactors = window.BIAS_FACTORS  || [];
  const biasColor = biasLabel === 'BULLISH' ? 'var(--green)'
                  : biasLabel === 'BEARISH' ? 'var(--red)'
                  : 'var(--amber)';

  // CPR derived
  const change    = ltp - prevClose;
  const changePct = prevClose ? (change / prevClose) * 100 : 0;
  const pricePos  = ltp > cpr.tc ? 'ABOVE' : ltp < cpr.bc ? 'BELOW' : 'INSIDE';
  const cprWidth  = cpr.tc - cpr.bc;
  const cprPct    = cpr.pivot ? (cprWidth / cpr.pivot) * 100 : 0;
  const cprType   = cprPct < 0.1 ? 'VERY NARROW' : cprPct < 0.2 ? 'NARROW' : cprPct < 0.4 ? 'MODERATE' : 'WIDE';

  // Options levels — Nifty strikes every 50 pts
  const expiry    = window.EXPIRY_INFO || {};
  const atmStrike = Math.round(ltp / 50) * 50;
  const ceTarget  = cpr.r1;  // CE target = R1
  const peTgt     = cpr.s1;  // PE target = S1
  const orbStatus = orb?.status || '—';

  // Y range for CPR bar
  const yLo = Math.min(...[cpr.s3, cpr.s2, cpr.s1, cpr.bc, cpr.pivot, cpr.tc, cpr.r1, cpr.r2, cpr.r3].filter(Boolean));
  const yHi = Math.max(...[cpr.s3, cpr.s2, cpr.s1, cpr.bc, cpr.pivot, cpr.tc, cpr.r1, cpr.r2, cpr.r3].filter(Boolean));
  const barPct = v => yHi > yLo ? Math.max(0, Math.min(100, ((v - yLo) / (yHi - yLo)) * 100)) : 50;

  return (
    <aside style={{
      width: 300, flexShrink: 0,
      borderLeft: '1px solid var(--hairline)',
      display: 'flex', flexDirection: 'column',
      gap: 8, padding: 8,
      overflow: 'auto', background: 'var(--bg)'
    }}>

      {/* ── 01 BIAS DIAL ─────────────────────────────────────────── */}
      <div className="panel">
        <div className="panel-h">
          <div className="lhs"><span className="num">01</span><span>Today's Bias</span></div>
          <div className="rhs">
            <span className="mono" style={{ fontSize: 9, color: 'var(--dim-2)' }}>every 10s</span>
            <span><span className="dot" />LIVE</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 12px' }}>
          <Gauge value={biasScore} max={10} label="SCORE" sublabel={biasLabel} color={biasColor} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div className="kv">
              <span className="k">Confidence</span>
              <span className="v" style={{ color: biasColor }}>{biasConf}%</span>
            </div>
            <div className="bar" style={{ height: 5 }}>
              <span style={{ width: biasConf + '%', background: biasColor }} />
            </div>
            <div style={{ marginTop: 4, padding: '5px 8px', background: 'var(--bg-2)',
              border: '1px solid var(--hairline-soft)', borderRadius: 3 }}>
              <div className="mono" style={{ fontSize: 9, color: 'var(--dim)', marginBottom: 2 }}>FACTORS</div>
              {biasFactors.length > 0 ? biasFactors.map((f, i) => {
                const col = f.signal === 'BULLISH' ? 'var(--green)'
                          : f.signal === 'BEARISH' ? 'var(--red)' : 'var(--dim)';
                return (
                  <div key={i} className="mono" style={{ fontSize: 9, color: col, lineHeight: 1.6 }}>
                    <span style={{ color: col }}>●</span> {f.factor}
                  </div>
                );
              }) : (
                <div className="mono" style={{ fontSize: 9, color: 'var(--dim)' }}>loading…</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── 02 OPTIONS SETUP ─────────────────────────────────────── */}
      <div className="panel">
        <div className="panel-h">
          <div className="lhs"><span className="num">02</span><span>Options Setup</span></div>
          <div className="rhs">
            {expiry.expiry_type && (
              <Chip tone={expiry.days_to_expiry === 0 ? 'red' : expiry.days_to_expiry <= 2 ? 'amber' : 'cyan'}>
                {expiry.expiry_type} {expiry.days_to_expiry === 0 ? 'TODAY' : `${expiry.days_to_expiry}d`}
              </Chip>
            )}
          </div>
        </div>
        <div style={{ padding: '8px 12px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 10px' }}>
          <div>
            <div className="mono" style={{ fontSize: 9, color: 'var(--dim)' }}>ATM STRIKE</div>
            <div className="mono" style={{ fontSize: 18, fontWeight: 600, color: 'var(--fg)' }}>{atmStrike}</div>
            <div className="mono" style={{ fontSize: 9, color: 'var(--dim)' }}>LTP {fmt(ltp)}</div>
          </div>
          <div>
            <div className="mono" style={{ fontSize: 9, color: 'var(--dim)' }}>EXPIRY</div>
            <div className="mono" style={{ fontSize: 12, color: 'var(--fg)', fontWeight: 500 }}>
              {expiry.next_expiry || '—'}
            </div>
            <div className="mono" style={{ fontSize: 9, color: expiry.is_today_expiry ? 'var(--red)' : 'var(--dim)' }}>
              {expiry.is_today_expiry ? '⚠ EXPIRY DAY' : `${expiry.days_to_expiry ?? '?'}d remaining`}
            </div>
          </div>
        </div>
        <div style={{ padding: '0 12px 10px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          {[
            { label: 'CE IDEA', value: atmStrike, sub: `target R1 ${fmt(ceTarget)}`,
              color: biasLabel === 'BULLISH' ? 'var(--green)' : 'var(--dim)', active: biasLabel === 'BULLISH' },
            { label: 'PE IDEA', value: atmStrike, sub: `target S1 ${fmt(peTgt)}`,
              color: biasLabel === 'BEARISH' ? 'var(--red)' : 'var(--dim)', active: biasLabel === 'BEARISH' },
          ].map(o => (
            <div key={o.label} style={{
              padding: '6px 8px', borderRadius: 3,
              background: o.active ? (o.color === 'var(--green)' ? 'oklch(0.74 0.16 145 / 0.1)' : 'oklch(0.68 0.20 27 / 0.1)') : 'var(--bg-2)',
              border: `1px solid ${o.active ? o.color : 'var(--hairline-soft)'}`,
            }}>
              <div className="mono" style={{ fontSize: 9, color: o.color, fontWeight: 600 }}>{o.label}</div>
              <div className="mono" style={{ fontSize: 14, color: 'var(--fg)', fontWeight: 600 }}>{o.value}</div>
              <div className="mono" style={{ fontSize: 9, color: 'var(--dim)' }}>{o.sub}</div>
            </div>
          ))}
        </div>
        <div style={{ padding: '6px 12px 8px', borderTop: '1px solid var(--hairline-soft)', background: 'var(--bg-2)' }}>
          <div className="mono" style={{ fontSize: 9, color: 'var(--dim)' }}>ORB-15 · {orbStatus}</div>
          <div className="mono" style={{ fontSize: 9, color: 'var(--amber)', marginTop: 2 }}>
            ⚠ ANALYSIS ONLY — verify before trading
          </div>
        </div>
      </div>

      {/* ── 03 CPR LEVELS ────────────────────────────────────────── */}
      <div className="panel">
        <div className="panel-h">
          <div className="lhs"><span className="num">03</span><span>CPR · Daily</span></div>
          <div className="rhs">
            <Chip tone="cyan">{cprType}</Chip>
          </div>
        </div>
        <div style={{ padding: '8px 0' }}>
          {[
            ['R3', cpr.r3, 'var(--red)'],
            ['R2', cpr.r2, 'var(--red)'],
            ['R1', cpr.r1, 'var(--red)'],
            ['TC', cpr.tc, 'var(--cyan)'],
            ['Pivot', cpr.pivot, 'var(--cyan)'],
            ['BC', cpr.bc, 'var(--cyan)'],
            ['S1', cpr.s1, 'var(--green)'],
            ['S2', cpr.s2, 'var(--green)'],
            ['S3', cpr.s3, 'var(--green)'],
          ].map(([k, v, col], i) => {
            if (!v) return null;
            const isPivot = k === 'Pivot' || k === 'TC' || k === 'BC';
            const dist = ltp - v;
            return (
              <div key={k} style={{
                display: 'grid', gridTemplateColumns: '36px 1fr 70px 56px',
                alignItems: 'center', padding: '4px 12px', gap: 8,
                background: isPivot ? 'oklch(0.80 0.14 220 / 0.05)' : 'transparent',
                borderTop: i === 3 || i === 6 ? '1px dashed var(--hairline-soft)' : 'none'
              }}>
                <span className="mono" style={{ fontSize: 10, color: col, fontWeight: isPivot ? 600 : 400 }}>{k}</span>
                <div style={{ position: 'relative', height: 4, background: 'var(--hairline-soft)', borderRadius: 1 }}>
                  <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0,
                    width: barPct(v) + '%', background: col, opacity: 0.6 }} />
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
          <div className="mono" style={{ fontSize: 11, color: pricePos === 'ABOVE' ? 'var(--green)' : pricePos === 'BELOW' ? 'var(--red)' : 'var(--amber)' }}>
            {pricePos === 'ABOVE' ? '▲' : pricePos === 'BELOW' ? '▼' : '◆'} {pricePos} CPR · width {cprPct.toFixed(3)}%
          </div>
        </div>
      </div>

      {/* ── 04 GAP & ORB ─────────────────────────────────────────── */}
      <div className="panel">
        <div className="panel-h">
          <div className="lhs"><span className="num">04</span><span>Gap & ORB</span></div>
        </div>
        <div style={{ padding: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <div className="mono" style={{ fontSize: 9, color: 'var(--dim)' }}>GAP</div>
            <div className="mono" style={{ fontSize: 18, fontWeight: 600, color: gapPts >= 0 ? 'var(--green)' : 'var(--red)' }}>
              {fmtPts(gapPts, 1)}
            </div>
            <div className="mono" style={{ fontSize: 10, color: 'var(--dim)' }}>
              {fmtPct(gapPct)} · {gapPts >= 0 ? 'UP' : 'DOWN'}
            </div>
          </div>
          <div>
            <div className="mono" style={{ fontSize: 9, color: 'var(--dim)' }}>ORB-15</div>
            {orb ? (<>
              <div className="mono" style={{ fontSize: 11, color: 'var(--fg)' }}>H {fmt(orb.high)}</div>
              <div className="mono" style={{ fontSize: 11, color: 'var(--fg-2)' }}>L {fmt(orb.low)}</div>
              <div className="mono" style={{ fontSize: 10, marginTop: 4,
                color: orbStatus === 'BREAKOUT' ? 'var(--green)' : orbStatus === 'BREAKDOWN' ? 'var(--red)' : 'var(--dim)' }}>
                {orbStatus}
              </div>
            </>) : <div className="mono" style={{ fontSize: 10, color: 'var(--dim)' }}>Market open</div>}
          </div>
        </div>
      </div>

      {/* ── 05 SIGNALS ───────────────────────────────────────────── */}
      <div className="panel">
        <div className="panel-h">
          <div className="lhs"><span className="num">05</span><span>Signals</span></div>
          <div className="rhs"><span>{signals.length} today</span></div>
        </div>
        <div style={{ maxHeight: 200, overflow: 'auto' }}>
          {signals.slice(0, 6).map((s, i) => {
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
                      <span key={k} style={{ width: 4, height: 4, borderRadius: 0.5,
                        background: k < s.conf ? col : 'var(--hairline)' }} />
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── 06 INDICATORS ────────────────────────────────────────── */}
      <div className="panel">
        <div className="panel-h">
          <div className="lhs"><span className="num">06</span><span>Indicators</span></div>
        </div>
        <div style={{ padding: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px' }}>
          <div className="kv"><span className="k">VWAP</span><span className="v">{fmt(vwap)}</span></div>
          <div className="kv"><span className="k">RSI 14</span>
            <span className="v" style={{ color: rsiNow > 70 ? 'var(--red)' : rsiNow < 30 ? 'var(--green)' : 'var(--cyan)' }}>
              {Number(rsiNow).toFixed(1)}
            </span>
          </div>
          <div className="kv"><span className="k">EMA 9</span><span className="v">{fmt(ema9Last)}</span></div>
          <div className="kv"><span className="k">EMA 21</span><span className="v">{fmt(ema21Last)}</span></div>
          <div className="kv"><span className="k">EMA 50</span><span className="v">{fmt(ema50Last)}</span></div>
          <div className="kv"><span className="k">MACD</span>
            <span className="v" style={{ color: macdH >= 0 ? 'var(--green)' : 'var(--red)' }}>
              {Number(macdH).toFixed(2)}
            </span>
          </div>
          <div className="kv" style={{ gridColumn: '1/-1' }}>
            <span className="k">vs VWAP</span>
            <span className="v" style={{ color: ltp > vwap ? 'var(--green)' : 'var(--red)' }}>
              {ltp > vwap ? '▲ ABOVE' : '▼ BELOW'} ({fmtPts(ltp - vwap, 1)})
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
}

window.RightRail = RightRail;
