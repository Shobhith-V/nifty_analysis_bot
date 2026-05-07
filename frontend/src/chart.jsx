function Chart() {
  const [interval, setInterval] = React.useState('1m');
  const [showCPR, setShowCPR] = React.useState(true);
  const [showVWAP, setShowVWAP] = React.useState(true);
  const [showEMA, setShowEMA] = React.useState(true);
  const [showORB, setShowORB] = React.useState(true);

  // Display only last ~180 candles for clarity
  const data = CANDLES.slice(-180);
  const W = 960, H = 460;
  const padL = 6, padR = 72, padT = 12, padB = 24;
  const plotW = W - padL - padR, plotH = H - padT - padB;

  const allVals = [
    ...data.map(c => c.h),
    ...data.map(c => c.l),
    CPR_DAILY.tc, CPR_DAILY.bc, CPR_DAILY.pivot,
    CPR_DAILY.r1, CPR_DAILY.s1,
  ];
  const yMin = Math.min(...allVals) - 5;
  const yMax = Math.max(...allVals) + 5;
  const yScale = (p) => padT + (1 - (p - yMin) / (yMax - yMin)) * plotH;
  const xScale = (i) => padL + (i / (data.length - 1)) * plotW;

  const candleW = Math.max(2, plotW / data.length * 0.7);

  const vwapTail = VWAP_SERIES.slice(-data.length);
  const ema9Tail = EMA9.slice(-data.length);
  const ema21Tail = EMA21.slice(-data.length);
  const macdTail = MACD_HIST.slice(-data.length);
  const rsiTail = RSI.slice(-data.length);

  const linePath = (arr) => arr.map((v, i) =>
    (i === 0 ? "M" : "L") + xScale(i).toFixed(1) + "," + yScale(v).toFixed(1)
  ).join(" ");

  // Y-axis ticks
  const yTicks = [];
  const tickStep = 25;
  for (let v = Math.ceil(yMin / tickStep) * tickStep; v <= yMax; v += tickStep) {
    yTicks.push(v);
  }

  // X-axis time labels (every ~30 candles)
  const xTicks = [];
  for (let i = 0; i < data.length; i += 30) xTicks.push(i);

  const ltp = data[data.length - 1].c;

  return (
    <div className="panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* Chart toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '6px 10px', borderBottom: '1px solid var(--hairline)',
        background: 'var(--bg-2)'
      }}>
        <span className="mono" style={{ fontSize: 10, letterSpacing: '0.1em', color: 'var(--dim)' }}>
          NIFTY 50 · INDEX
        </span>
        <span style={{ color: 'var(--hairline)' }}>│</span>
        <div style={{ display: 'flex', gap: 0 }}>
          {['1m','3m','5m','15m','1h','1D'].map(iv => (
            <button key={iv}
              onClick={() => setInterval(iv)}
              className={"btn sm " + (interval === iv ? "active" : "")}
              style={{ borderRadius: 0, marginLeft: -1 }}>
              {iv}
            </button>
          ))}
        </div>
        <span style={{ color: 'var(--hairline)' }}>│</span>
        <button className={"btn sm " + (showCPR ? "active" : "")} onClick={() => setShowCPR(v=>!v)}>CPR</button>
        <button className={"btn sm " + (showVWAP ? "active" : "")} onClick={() => setShowVWAP(v=>!v)}>VWAP</button>
        <button className={"btn sm " + (showEMA ? "active" : "")} onClick={() => setShowEMA(v=>!v)}>EMA 9·21</button>
        <button className={"btn sm " + (showORB ? "active" : "")} onClick={() => setShowORB(v=>!v)}>ORB-15</button>
        <button className="btn sm">+ Indicator</button>

        <div style={{ flex: 1 }} />

        {/* OHLC readout */}
        <div className="mono" style={{ fontSize: 10, color: 'var(--dim)', display: 'flex', gap: 10 }}>
          <span>O <span style={{ color: 'var(--fg-2)' }}>{fmt(data[data.length-1].o)}</span></span>
          <span>H <span style={{ color: 'var(--green)' }}>{fmt(Math.max(...data.map(c=>c.h)))}</span></span>
          <span>L <span style={{ color: 'var(--red)' }}>{fmt(Math.min(...data.map(c=>c.l)))}</span></span>
          <span>C <span style={{ color: 'var(--fg)' }}>{fmt(ltp)}</span></span>
          <span>V <span style={{ color: 'var(--fg-2)' }}>{(data.reduce((s,c)=>s+c.v,0)/1e6).toFixed(1)}M</span></span>
        </div>

        <button className="btn sm icon tooltip" data-tip="Fullscreen">⛶</button>
        <button className="btn sm icon tooltip" data-tip="Settings">⚙</button>
      </div>

      {/* Main chart area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, position: 'relative' }} className="crosshair">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', flex: '1 1 auto', display: 'block', minHeight: 0 }}>
          <defs>
            <pattern id="chartgrid" width="60" height="40" patternUnits="userSpaceOnUse">
              <path d="M 60 0 L 0 0 0 40" fill="none" stroke="var(--hairline-soft)" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect x={padL} y={padT} width={plotW} height={plotH} fill="url(#chartgrid)" />

          {/* Y gridlines + labels */}
          {yTicks.map(v => (
            <g key={v}>
              <line x1={padL} x2={padL + plotW} y1={yScale(v)} y2={yScale(v)}
                stroke="var(--hairline-soft)" strokeWidth="0.5" strokeDasharray="2 4" />
              <text x={padL + plotW + 6} y={yScale(v) + 3}
                fontFamily="var(--mono)" fontSize="9" fill="var(--dim)">{fmt(v, 0)}</text>
            </g>
          ))}

          {/* X labels */}
          {xTicks.map(i => (
            <text key={i} x={xScale(i)} y={H - 8}
              fontFamily="var(--mono)" fontSize="9" fill="var(--dim)" textAnchor="middle">
              {data[i]?.tStr}
            </text>
          ))}

          {/* CPR band */}
          {showCPR && (
            <g>
              <rect x={padL} y={yScale(CPR_DAILY.tc)} width={plotW}
                height={yScale(CPR_DAILY.bc) - yScale(CPR_DAILY.tc)}
                fill="var(--cyan)" opacity="0.08" />
              <line x1={padL} x2={padL + plotW} y1={yScale(CPR_DAILY.pivot)} y2={yScale(CPR_DAILY.pivot)}
                stroke="var(--cyan)" strokeWidth="1.2" />
              <line x1={padL} x2={padL + plotW} y1={yScale(CPR_DAILY.tc)} y2={yScale(CPR_DAILY.tc)}
                stroke="var(--cyan)" strokeWidth="0.8" strokeDasharray="3 3" />
              <line x1={padL} x2={padL + plotW} y1={yScale(CPR_DAILY.bc)} y2={yScale(CPR_DAILY.bc)}
                stroke="var(--cyan)" strokeWidth="0.8" strokeDasharray="3 3" />
              {[
                ['R1', CPR_DAILY.r1, 'var(--red)'],
                ['S1', CPR_DAILY.s1, 'var(--green)'],
              ].map(([lbl, v, col]) => (
                <g key={lbl}>
                  <line x1={padL} x2={padL + plotW} y1={yScale(v)} y2={yScale(v)}
                    stroke={col} strokeWidth="0.6" strokeDasharray="1 4" opacity="0.6" />
                  <text x={padL + 4} y={yScale(v) - 3} fontFamily="var(--mono)" fontSize="8" fill={col} opacity="0.8">{lbl} {fmt(v)}</text>
                </g>
              ))}
              <text x={padL + 4} y={yScale(CPR_DAILY.pivot) - 3}
                fontFamily="var(--mono)" fontSize="8" fill="var(--cyan)">P {fmt(CPR_DAILY.pivot)}</text>
              <text x={padL + 4} y={yScale(CPR_DAILY.tc) - 3}
                fontFamily="var(--mono)" fontSize="8" fill="var(--cyan)" opacity="0.7">TC {fmt(CPR_DAILY.tc)}</text>
              <text x={padL + 4} y={yScale(CPR_DAILY.bc) + 9}
                fontFamily="var(--mono)" fontSize="8" fill="var(--cyan)" opacity="0.7">BC {fmt(CPR_DAILY.bc)}</text>
            </g>
          )}

          {/* ORB band */}
          {showORB && (
            <g>
              <rect x={xScale(0)} y={yScale(ORB_15.high)} width={xScale(15) - xScale(0)}
                height={yScale(ORB_15.low) - yScale(ORB_15.high)}
                fill="var(--amber)" opacity="0.10" />
              <line x1={padL} x2={padL + plotW} y1={yScale(ORB_15.high)} y2={yScale(ORB_15.high)}
                stroke="var(--amber)" strokeWidth="0.6" strokeDasharray="2 3" opacity="0.7" />
              <line x1={padL} x2={padL + plotW} y1={yScale(ORB_15.low)} y2={yScale(ORB_15.low)}
                stroke="var(--amber)" strokeWidth="0.6" strokeDasharray="2 3" opacity="0.7" />
              <text x={padL + plotW - 60} y={yScale(ORB_15.high) - 3} fontFamily="var(--mono)" fontSize="8" fill="var(--amber)">ORB-H {fmt(ORB_15.high)}</text>
              <text x={padL + plotW - 60} y={yScale(ORB_15.low) + 9} fontFamily="var(--mono)" fontSize="8" fill="var(--amber)">ORB-L {fmt(ORB_15.low)}</text>
            </g>
          )}

          {/* VWAP */}
          {showVWAP && (
            <path d={linePath(vwapTail)} fill="none" stroke="var(--violet)" strokeWidth="1.4" />
          )}
          {/* EMA */}
          {showEMA && (
            <>
              <path d={linePath(ema9Tail)} fill="none" stroke="var(--amber)" strokeWidth="1" opacity="0.85" />
              <path d={linePath(ema21Tail)} fill="none" stroke="var(--cyan)" strokeWidth="1" opacity="0.7" />
            </>
          )}

          {/* Candles */}
          {data.map((c, i) => {
            const x = xScale(i);
            const up = c.c >= c.o;
            const col = up ? "var(--green)" : "var(--red)";
            return (
              <g key={i}>
                <line x1={x} x2={x} y1={yScale(c.h)} y2={yScale(c.l)} stroke={col} strokeWidth="1" />
                <rect x={x - candleW/2} y={yScale(Math.max(c.o, c.c))}
                  width={candleW} height={Math.max(1, Math.abs(yScale(c.o) - yScale(c.c)))}
                  fill={col} />
              </g>
            );
          })}

          {/* Live LTP line */}
          <line x1={padL} x2={padL + plotW} y1={yScale(ltp)} y2={yScale(ltp)}
            stroke="var(--cyan)" strokeWidth="1" strokeDasharray="4 3" opacity="0.9" />
          <rect x={padL + plotW + 2} y={yScale(ltp) - 9} width={68} height={18} fill="var(--cyan)" />
          <text x={padL + plotW + 6} y={yScale(ltp) + 3.5}
            fontFamily="var(--mono)" fontSize="10" fontWeight="600" fill="var(--bg)">{fmt(ltp)}</text>

          {/* Signal markers */}
          {SIGNALS.slice(0, 3).map((s, idx) => {
            // Approximate position by mapping time → candle index
            const idxC = Math.max(0, data.findIndex(c => c.tStr >= s.t));
            const i = idxC === -1 ? data.length - 1 : idxC;
            const x = xScale(i);
            const y = yScale(data[i]?.c || ltp);
            const col = s.dir === 'BULLISH' ? 'var(--green)' : s.dir === 'BEARISH' ? 'var(--red)' : 'var(--amber)';
            return (
              <g key={idx}>
                <circle cx={x} cy={y - 14} r="4" fill={col} />
                <line x1={x} x2={x} y1={y - 10} y2={y - 4} stroke={col} strokeWidth="1" />
                <text x={x} y={y - 18} fontFamily="var(--mono)" fontSize="8" fill={col} textAnchor="middle">
                  {s.type.split('_')[0]}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Legend overlay (top-left) */}
        <div style={{
          position: 'absolute', top: 10, left: 10,
          display: 'flex', flexDirection: 'column', gap: 3,
          fontFamily: 'var(--mono)', fontSize: 10,
          background: 'oklch(0.20 0.014 250 / 0.85)',
          padding: '6px 10px', borderRadius: 3,
          border: '1px solid var(--hairline)'
        }}>
          {showVWAP && <div><span style={{ color: 'var(--violet)' }}>━</span> <span style={{ color: 'var(--dim)' }}>VWAP</span> <span style={{ color: 'var(--fg-2)' }}>{fmt(VWAP)}</span></div>}
          {showEMA && <div><span style={{ color: 'var(--amber)' }}>━</span> <span style={{ color: 'var(--dim)' }}>EMA9</span> <span style={{ color: 'var(--fg-2)' }}>{fmt(EMA9[EMA9.length-1])}</span></div>}
          {showEMA && <div><span style={{ color: 'var(--cyan)' }}>━</span> <span style={{ color: 'var(--dim)' }}>EMA21</span> <span style={{ color: 'var(--fg-2)' }}>{fmt(EMA21[EMA21.length-1])}</span></div>}
          {showCPR && <div><span style={{ color: 'var(--cyan)' }}>▭</span> <span style={{ color: 'var(--dim)' }}>CPR</span> <span style={{ color: 'var(--fg-2)' }}>{fmt(CPR_DAILY.bc)}—{fmt(CPR_DAILY.tc)}</span></div>}
        </div>
      </div>

      {/* Volume sub-pane */}
      <div style={{
        height: 56, borderTop: '1px solid var(--hairline)',
        display: 'flex', alignItems: 'flex-end', padding: '4px 6px',
        background: 'oklch(0.18 0.013 250)'
      }}>
        <div className="mono" style={{
          position: 'absolute', writingMode: 'horizontal-tb',
          fontSize: 8, letterSpacing: '0.15em', color: 'var(--dim)', padding: '4px 0 0 4px'
        }}>VOL</div>
        <svg viewBox={`0 0 ${W} 50`} preserveAspectRatio="none" style={{ width: '100%', height: 50 }}>
          {data.map((c, i) => {
            const maxV = Math.max(...data.map(d => d.v));
            const h = (c.v / maxV) * 46;
            const up = c.c >= c.o;
            return (
              <rect key={i} x={xScale(i) - candleW/2} y={50 - h}
                width={candleW} height={h}
                fill={up ? "var(--green)" : "var(--red)"} opacity="0.55" />
            );
          })}
        </svg>
      </div>

      {/* RSI / MACD strip */}
      <div style={{
        height: 70, borderTop: '1px solid var(--hairline)',
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0,
        background: 'oklch(0.18 0.013 250)'
      }}>
        {/* RSI */}
        <div style={{ position: 'relative', borderRight: '1px solid var(--hairline)' }}>
          <div className="mono" style={{
            position: 'absolute', top: 4, left: 6, fontSize: 9, color: 'var(--dim)',
            display: 'flex', gap: 6, zIndex: 2
          }}>
            <span>RSI(14)</span>
            <span style={{ color: RSI_NOW > 70 ? 'var(--red)' : RSI_NOW < 30 ? 'var(--green)' : 'var(--cyan)' }}>{RSI_NOW.toFixed(1)}</span>
          </div>
          <svg viewBox="0 0 480 70" preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
            <line x1="0" x2="480" y1="14" y2="14" stroke="var(--red)" strokeWidth="0.5" strokeDasharray="2 3" opacity="0.5" />
            <line x1="0" x2="480" y1="56" y2="56" stroke="var(--green)" strokeWidth="0.5" strokeDasharray="2 3" opacity="0.5" />
            <line x1="0" x2="480" y1="35" y2="35" stroke="var(--hairline)" strokeWidth="0.5" />
            <path d={rsiTail.map((v, i) => {
              const x = (i / (rsiTail.length - 1)) * 480;
              const y = 70 - (v / 100) * 70;
              return (i === 0 ? "M" : "L") + x.toFixed(1) + "," + y.toFixed(1);
            }).join(" ")} fill="none" stroke="var(--cyan)" strokeWidth="1" />
          </svg>
        </div>
        {/* MACD */}
        <div style={{ position: 'relative' }}>
          <div className="mono" style={{
            position: 'absolute', top: 4, left: 6, fontSize: 9, color: 'var(--dim)',
            display: 'flex', gap: 6, zIndex: 2
          }}>
            <span>MACD(12,26,9)</span>
            <span style={{ color: 'var(--green)' }}>{MACD_HIST[MACD_HIST.length-1].toFixed(2)}</span>
          </div>
          <svg viewBox="0 0 480 70" preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
            <line x1="0" x2="480" y1="35" y2="35" stroke="var(--hairline)" strokeWidth="0.5" />
            {macdTail.map((v, i) => {
              const x = (i / (macdTail.length - 1)) * 480;
              const maxAbs = Math.max(...macdTail.map(Math.abs));
              const h = (Math.abs(v) / maxAbs) * 30;
              return (
                <rect key={i} x={x - 0.8} y={v >= 0 ? 35 - h : 35} width="1.6" height={h}
                  fill={v >= 0 ? "var(--green)" : "var(--red)"} opacity="0.7" />
              );
            })}
          </svg>
        </div>
      </div>
    </div>
  );
}

window.Chart = Chart;
