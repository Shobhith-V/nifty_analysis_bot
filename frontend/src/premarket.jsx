function PreMarket() {
  const done = CHECKLIST.filter(c => c.done).length;
  const pct = (done / CHECKLIST.length) * 100;
  return (
    <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, padding: 10, minHeight: 0, overflow: 'auto' }}>
      {/* Checklist */}
      <div className="panel" style={{ display: 'flex', flexDirection: 'column' }}>
        <div className="panel-h">
          <div className="lhs"><span className="num">✓</span><span>Pre-Market Checklist</span></div>
          <div className="rhs"><span>{done}/{CHECKLIST.length}</span></div>
        </div>
        <div style={{ padding: 12 }}>
          <div className="mono" style={{ fontSize: 9, color: 'var(--dim)', marginBottom: 4 }}>READINESS · {Math.round(pct)}%</div>
          <div className="bar" style={{ height: 8, marginBottom: 12 }}><span style={{ width: pct + '%', background: pct === 100 ? 'var(--green)' : 'var(--cyan)' }} /></div>
          {CHECKLIST.map((c, i) => (
            <div key={c.id} style={{
              display: 'grid', gridTemplateColumns: '24px 1fr auto', gap: 10, padding: '10px 0',
              borderBottom: '1px solid var(--hairline-soft)', alignItems: 'center'
            }}>
              <div style={{
                width: 18, height: 18, borderRadius: 2,
                border: '1px solid ' + (c.done ? 'var(--green)' : 'var(--hairline)'),
                background: c.done ? 'var(--green-soft)' : 'var(--bg-2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--green)', fontSize: 11
              }}>{c.done ? '✓' : ''}</div>
              <div>
                <div style={{ fontSize: 12, color: c.done ? 'var(--fg-2)' : 'var(--fg)' }}>{c.label}</div>
                <div className="mono" style={{ fontSize: 10, color: 'var(--dim)' }}>{c.detail}</div>
              </div>
              <Chip tone={c.done ? 'green' : 'amber'}>{c.done ? 'OK' : 'TODO'}</Chip>
            </div>
          ))}
        </div>
      </div>

      {/* Today's setup brief */}
      <div className="panel" style={{ display: 'flex', flexDirection: 'column' }}>
        <div className="panel-h">
          <div className="lhs"><span className="num">≣</span><span>Today's Setup Brief</span></div>
          <div className="rhs"><span>auto-generated 08:42 IST</span></div>
        </div>
        <div style={{ padding: '14px 16px', overflow: 'auto' }}>
          <div className="serif" style={{ fontSize: 22, fontStyle: 'italic', color: 'var(--fg)', marginBottom: 4, lineHeight: 1.2 }}>
            "Narrow CPR signals trending day. Bias bullish above {fmt(CPR_DAILY.tc)}."
          </div>
          <div className="mono" style={{ fontSize: 10, color: 'var(--dim)', marginBottom: 16, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            — Generated brief · Confidence 64%
          </div>

          {[
            ['LEVELS TO WATCH', [
              ['Resistance', `R1 ${fmt(CPR_DAILY.r1)} · R2 ${fmt(CPR_DAILY.r2)} · weekly TC 24,892`],
              ['Support', `Pivot ${fmt(CPR_DAILY.pivot)} · S1 ${fmt(CPR_DAILY.s1)} · prev low 24,762`],
              ['CPR Band', `${fmt(CPR_DAILY.bc)} — ${fmt(CPR_DAILY.tc)} · width 0.12% (Narrow)`],
            ]],
            ['CONTEXT', [
              ['Global cues', 'GIFT +0.31%, Asia mixed, US closed marginally lower'],
              ['Macro', 'No major events; weekly expiry Thursday'],
              ['Sector tilt', 'Banks bullish, IT cautious post-TCS guidance'],
            ]],
            ['STRATEGY ARMED', [
              ['Primary', 'CPR-Bias + VWAP-Reclaim · activates 09:30'],
              ['Secondary', 'ORB-15 breakout · triggers if vol > 1.5×'],
              ['Risk per trade', '0.5% NAV · max 3 concurrent'],
            ]],
          ].map(([title, rows]) => (
            <div key={title} style={{ marginBottom: 16 }}>
              <div className="section-h">{title}</div>
              {rows.map(([k, v]) => (
                <div key={k} style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: 10, padding: '4px 0' }}>
                  <span className="mono" style={{ fontSize: 10, color: 'var(--dim)' }}>{k}</span>
                  <span style={{ fontSize: 11, color: 'var(--fg-2)' }}>{v}</span>
                </div>
              ))}
            </div>
          ))}

          <div style={{ padding: 10, background: 'var(--bg-2)', border: '1px solid var(--hairline-soft)', borderRadius: 3, marginTop: 8 }}>
            <div className="mono" style={{ fontSize: 9, color: 'var(--amber)', marginBottom: 4 }}>⚠ ANALYSIS ONLY</div>
            <div style={{ fontSize: 11, color: 'var(--dim)', lineHeight: 1.5 }}>
              This bot does not place orders. Past signals do not guarantee future performance.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

window.PreMarket = PreMarket;
