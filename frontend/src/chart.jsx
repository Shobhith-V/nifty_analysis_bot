function Chart() {
  const [interval, setIntervalSel] = React.useState('1m');
  const [showCPR, setShowCPR] = React.useState(true);
  const [showVWAP, setShowVWAP] = React.useState(true);
  const [showEMA, setShowEMA] = React.useState(true);
  const [showORB, setShowORB] = React.useState(true);
  const chartRef = React.useRef(null);
  const svgRef = React.useRef(null);

  // Force re-render on tick / candle / data-ready events so the chart updates live
  const [, forceTick] = React.useReducer(x => x + 1, 0);
  React.useEffect(() => {
    let raf = null;
    const schedule = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => { raf = null; forceTick(); });
    };
    document.addEventListener('nifty-tick', schedule);
    document.addEventListener('nifty-candle', schedule);
    document.addEventListener('nifty-data-ready', schedule);
    return () => {
      document.removeEventListener('nifty-tick', schedule);
      document.removeEventListener('nifty-candle', schedule);
      document.removeEventListener('nifty-data-ready', schedule);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  // Pan + zoom state — view window into the candles
  const allCandles = window.CANDLES || CANDLES;
  const total = allCandles.length;
  const [viewSize, setViewSize] = React.useState(180); // # of candles visible
  const [viewEnd, setViewEnd] = React.useState(total); // last visible index (exclusive), null=stick to live
  const [stickLive, setStickLive] = React.useState(true);

  // Auto-stick to the rightmost edge when new candles arrive
  React.useEffect(() => {
    if (stickLive) setViewEnd(allCandles.length);
  }, [allCandles.length, stickLive]);

  // Sync visibility from LeftRail toggle events
  React.useEffect(() => {
    const apply = (i) => {
      if (!i) return;
      if (i.cpr  !== undefined) setShowCPR(!!i.cpr);
      if (i.vwap !== undefined) setShowVWAP(!!i.vwap);
      if (i.ema9 !== undefined || i.ema21 !== undefined) setShowEMA(!!(i.ema9 || i.ema21));
      if (i.orb !== undefined) setShowORB(!!i.orb);
    };
    apply(window.__indicators);
    const onChange = (e) => apply(e.detail);
    document.addEventListener('indicators-changed', onChange);
    return () => document.removeEventListener('indicators-changed', onChange);
  }, []);

  const toggleFullscreen = () => {
    const el = chartRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen && el.requestFullscreen().catch(() => window._toast && window._toast('Fullscreen blocked'));
    } else {
      document.exitFullscreen && document.exitFullscreen();
    }
  };

  // Compute view slice
  const N = allCandles.length;
  const end   = Math.max(1, Math.min(viewEnd || N, N));
  const size  = Math.max(20, Math.min(viewSize, N));
  const start = Math.max(0, end - size);
  const data  = allCandles.slice(start, end);

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
  const xScale = (i) => padL + (i / Math.max(1, data.length - 1)) * plotW;
  const candleW = Math.max(2, plotW / data.length * 0.7);

  // Indicator series — slice the same window
  const sliceTail = (arr) => arr ? arr.slice(start, end) : [];
  const vwapTail  = sliceTail(window.VWAP_SERIES || VWAP_SERIES);
  const ema9Tail  = sliceTail(window.EMA9 || EMA9);
  const ema21Tail = sliceTail(window.EMA21 || EMA21);
  const macdTail  = sliceTail(window.MACD_HIST || MACD_HIST);
  const rsiTail   = sliceTail(window.RSI || RSI);

  const linePath = (arr) => arr.map((v, i) =>
    (i === 0 ? "M" : "L") + xScale(i).toFixed(1) + "," + yScale(v).toFixed(1)
  ).join(" ");

  const yTicks = [];
  const tickStep = 25;
  for (let v = Math.ceil(yMin / tickStep) * tickStep; v <= yMax; v += tickStep) yTicks.push(v);

  const xTicks = [];
  for (let i = 0; i < data.length; i += Math.max(20, Math.floor(data.length / 6))) xTicks.push(i);

  const ltp = data[data.length - 1]?.c ?? (window.LTP || LTP);

  // ── Pan + zoom interaction ────────────────────────────────────────────────
  const dragRef = React.useRef(null);
  const onPointerDown = (e) => {
    e.target.setPointerCapture && e.target.setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, end, size };
    setStickLive(false);
  };
  const onPointerMove = (e) => {
    const d = dragRef.current;
    if (!d || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const candlesPerPx = d.size / rect.width;
    const dxCandles = (e.clientX - d.x) * candlesPerPx;
    let newEnd = Math.round(d.end - dxCandles);
    newEnd = Math.max(d.size, Math.min(N, newEnd));
    setViewEnd(newEnd);
    if (newEnd >= N) setStickLive(true);
  };
  const onPointerUp = () => { dragRef.current = null; };
  const onWheel = (e) => {
    e.preventDefault();
    // Vertical wheel = zoom (horizontal pan if shift-held)
    if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
      const dx = e.shiftKey ? e.deltaY : e.deltaX;
      const candlesPerPx = size / (svgRef.current?.getBoundingClientRect().width || 800);
      let newEnd = Math.round(end + dx * candlesPerPx);
      newEnd = Math.max(size, Math.min(N, newEnd));
      setViewEnd(newEnd);
      setStickLive(newEnd >= N);
    } else {
      const factor = e.deltaY > 0 ? 1.15 : 1 / 1.15;
      let newSize = Math.round(size * factor);
      newSize = Math.max(20, Math.min(N, newSize));
      setViewSize(newSize);
    }
  };
  const goLive = () => { setStickLive(true); setViewEnd(N); };
  const zoom = (factor) => {
    let newSize = Math.round(size * factor);
    newSize = Math.max(20, Math.min(N, newSize));
    setViewSize(newSize);
  };
  const pan = (deltaCandles) => {
    let newEnd = Math.max(size, Math.min(N, end + deltaCandles));
    setViewEnd(newEnd);
    setStickLive(newEnd >= N);
  };

  return (
    <div ref={chartRef} className="panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0 }}>
      {/* Chart toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '6px 10px', borderBottom: '1px solid var(--hairline)',
        background: 'var(--bg-2)',
        flexWrap: 'wrap', rowGap: 4
      }}>
        <span className="mono" style={{ fontSize: 10, letterSpacing: '0.1em', color: 'var(--dim)' }}>
          NIFTY 50 · INDEX
        </span>
        <span style={{ color: 'var(--hairline)' }}>│</span>
        <div style={{ display: 'flex', gap: 0 }}>
          {['1m','3m','5m','15m','1h','1D'].map(iv => (
            <button key={iv}
              onClick={() => setIntervalSel(iv)}
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

        <span style={{ color: 'var(--hairline)' }}>│</span>
        <button className="btn sm icon tooltip" data-tip="Pan left" onClick={() => pan(-Math.round(size * 0.25))}>‹</button>
        <button className="btn sm icon tooltip" data-tip="Pan right" onClick={() => pan(Math.round(size * 0.25))}>›</button>
        <button className="btn sm icon tooltip" data-tip="Zoom in" onClick={() => zoom(1/1.3)}>+</button>
        <button className="btn sm icon tooltip" data-tip="Zoom out" onClick={() => zoom(1.3)}>−</button>
        <button className={"btn sm " + (stickLive ? "active" : "")} onClick={goLive}>● LIVE</button>

        <div style={{ flex: 1 }} />

        <div className="mono" style={{ fontSize: 10, color: 'var(--dim)', display: 'flex', gap: 10 }}>
          <span>O <span style={{ color: 'var(--fg-2)' }}>{fmt(data[data.length-1]?.o)}</span></span>
          <span>H <span style={{ color: 'var(--green)' }}>{fmt(Math.max(...data.map(c=>c.h)))}</span></span>
          <span>L <span style={{ color: 'var(--red)' }}>{fmt(Math.min(...data.map(c=>c.l)))}</span></span>
          <span>C <span style={{ color: 'var(--fg)' }}>{fmt(ltp)}</span></span>
          <span>V <span style={{ color: 'var(--fg-2)' }}>{(data.reduce((s,c)=>s+c.v,0)/1e6).toFixed(1)}M</span></span>
        </div>

        <button className="btn sm icon tooltip" data-tip="Fullscreen" onClick={toggleFullscreen}>⛶</button>
      </div>

      {/* Main chart area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, position: 'relative' }}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          style={{
            width: '100%', flex: '1 1 auto', display: 'block', minHeight: 0,
            cursor: dragRef.current ? 'grabbing' : 'grab',
            touchAction: 'none', userSelect: 'none'
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onWheel={onWheel}
        >
          <defs>
            <pattern id="chartgrid" width="60" height="40" patternUnits="userSpaceOnUse">
              <path d="M 60 0 L 0 0 0 40" fill="none" stroke="var(--hairline-soft)" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect x={padL} y={padT} width={plotW} height={plotH} fill="url(#chartgrid)" />

          {yTicks.map(v => (
            <g key={v}>
              <line x1={padL} x2={padL + plotW} y1={yScale(v)} y2={yScale(v)}
                stroke="var(--hairline-soft)" strokeWidth="0.5" strokeDasharray="2 4" />
              <text x={padL + plotW + 6} y={yScale(v) + 3}
                fontFamily="var(--mono)" fontSize="9" fill="var(--dim)">{fmt(v, 0)}</text>
            </g>
          ))}

          {xTicks.map(i => (
            <text key={i} x={xScale(i)} y={H - 8}
              fontFamily="var(--mono)" fontSize="9" fill="var(--dim)" textAnchor="middle">
              {data[i]?.tStr}
            </text>
          ))}

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
              <text x={padL + 4} y={yScale(CPR_DAILY.pivot) - 3}
                fontFamily="var(--mono)" fontSize="8" fill="var(--cyan)">P {fmt(CPR_DAILY.pivot)}</text>
              <text x={padL + 4} y={yScale(CPR_DAILY.tc) - 3}
                fontFamily="var(--mono)" fontSize="8" fill="var(--cyan)" opacity="0.7">TC {fmt(CPR_DAILY.tc)}</text>
              <text x={padL + 4} y={yScale(CPR_DAILY.bc) + 9}
                fontFamily="var(--mono)" fontSize="8" fill="var(--cyan)" opacity="0.7">BC {fmt(CPR_DAILY.bc)}</text>
            </g>
          )}

          {showORB && start === 0 && (
            <g>
              <rect x={xScale(0)} y={yScale(ORB_15.high)} width={Math.max(0, xScale(Math.min(15, data.length-1)) - xScale(0))}
                height={yScale(ORB_15.low) - yScale(ORB_15.high)}
                fill="var(--amber)" opacity="0.10" />
            </g>
          )}

          {showVWAP && vwapTail.length > 0 && (
            <path d={linePath(vwapTail)} fill="none" stroke="var(--violet)" strokeWidth="1.4" />
          )}
          {showEMA && ema9Tail.length > 0 && (
            <>
              <path d={linePath(ema9Tail)} fill="none" stroke="var(--amber)" strokeWidth="1" opacity="0.85" />
              <path d={linePath(ema21Tail)} fill="none" stroke="var(--cyan)" strokeWidth="1" opacity="0.7" />
            </>
          )}

          {data.map((c, i) => {
            const x = xScale(i);
            const up = c.c >= c.o;
            const col = up ? "var(--green)" : "var(--red)";
            return (
              <g key={start + i}>
                <line x1={x} x2={x} y1={yScale(c.h)} y2={yScale(c.l)} stroke={col} strokeWidth="1" />
                <rect x={x - candleW/2} y={yScale(Math.max(c.o, c.c))}
                  width={candleW} height={Math.max(1, Math.abs(yScale(c.o) - yScale(c.c)))}
                  fill={col} />
              </g>
            );
          })}

          <line x1={padL} x2={padL + plotW} y1={yScale(ltp)} y2={yScale(ltp)}
            stroke="var(--cyan)" strokeWidth="1" strokeDasharray="4 3" opacity="0.9" />
          <rect x={padL + plotW + 2} y={yScale(ltp) - 9} width={68} height={18} fill="var(--cyan)" />
          <text x={padL + plotW + 6} y={yScale(ltp) + 3.5}
            fontFamily="var(--mono)" fontSize="10" fontWeight="600" fill="var(--bg)">{fmt(ltp)}</text>
        </svg>

        <div style={{
          position: 'absolute', top: 10, left: 10,
          display: 'flex', flexDirection: 'column', gap: 3,
          fontFamily: 'var(--mono)', fontSize: 10,
          background: 'oklch(0.20 0.014 250 / 0.85)',
          padding: '6px 10px', borderRadius: 3,
          border: '1px solid var(--hairline)',
          pointerEvents: 'none'
        }}>
          {showVWAP && <div><span style={{ color: 'var(--violet)' }}>━</span> <span style={{ color: 'var(--dim)' }}>VWAP</span> <span style={{ color: 'var(--fg-2)' }}>{fmt(window.VWAP || VWAP)}</span></div>}
          {showEMA && <div><span style={{ color: 'var(--amber)' }}>━</span> <span style={{ color: 'var(--dim)' }}>EMA9</span></div>}
          {showCPR && <div><span style={{ color: 'var(--cyan)' }}>▭</span> <span style={{ color: 'var(--dim)' }}>CPR</span></div>}
          <div style={{ marginTop: 2, color: 'var(--dim-2)' }}>
            {data.length} bars · {start+1}–{end} of {N}
          </div>
        </div>

        <div style={{
          position: 'absolute', bottom: 6, right: 80,
          fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--dim-2)',
          pointerEvents: 'none'
        }}>
          drag to pan · wheel to zoom · shift+wheel to scroll
        </div>
      </div>

      <div style={{
        height: 56, borderTop: '1px solid var(--hairline)',
        display: 'flex', alignItems: 'flex-end', padding: '4px 6px',
        background: 'oklch(0.18 0.013 250)'
      }}>
        <svg viewBox={`0 0 ${W} 50`} preserveAspectRatio="none" style={{ width: '100%', height: 50 }}>
          {data.map((c, i) => {
            const maxV = Math.max(...data.map(d => d.v), 1);
            const h = (c.v / maxV) * 46;
            const up = c.c >= c.o;
            return (
              <rect key={start + i} x={xScale(i) - candleW/2} y={50 - h}
                width={candleW} height={h}
                fill={up ? "var(--green)" : "var(--red)"} opacity="0.55" />
            );
          })}
        </svg>
      </div>

      <div style={{
        height: 70, borderTop: '1px solid var(--hairline)',
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0,
        background: 'oklch(0.18 0.013 250)'
      }}>
        <div style={{ position: 'relative', borderRight: '1px solid var(--hairline)' }}>
          <div className="mono" style={{
            position: 'absolute', top: 4, left: 6, fontSize: 9, color: 'var(--dim)',
            display: 'flex', gap: 6, zIndex: 2
          }}>
            <span>RSI(14)</span>
            <span style={{ color: (window.RSI_NOW||RSI_NOW) > 70 ? 'var(--red)' : (window.RSI_NOW||RSI_NOW) < 30 ? 'var(--green)' : 'var(--cyan)' }}>{(window.RSI_NOW||RSI_NOW).toFixed(1)}</span>
          </div>
          <svg viewBox="0 0 480 70" preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
            <line x1="0" x2="480" y1="14" y2="14" stroke="var(--red)" strokeWidth="0.5" strokeDasharray="2 3" opacity="0.5" />
            <line x1="0" x2="480" y1="56" y2="56" stroke="var(--green)" strokeWidth="0.5" strokeDasharray="2 3" opacity="0.5" />
            <line x1="0" x2="480" y1="35" y2="35" stroke="var(--hairline)" strokeWidth="0.5" />
            {rsiTail.length > 0 && (
              <path d={rsiTail.map((v, i) => {
                const x = (i / Math.max(1, rsiTail.length - 1)) * 480;
                const y = 70 - (v / 100) * 70;
                return (i === 0 ? "M" : "L") + x.toFixed(1) + "," + y.toFixed(1);
              }).join(" ")} fill="none" stroke="var(--cyan)" strokeWidth="1" />
            )}
          </svg>
        </div>
        <div style={{ position: 'relative' }}>
          <div className="mono" style={{
            position: 'absolute', top: 4, left: 6, fontSize: 9, color: 'var(--dim)',
            display: 'flex', gap: 6, zIndex: 2
          }}>
            <span>MACD(12,26,9)</span>
            <span style={{ color: 'var(--green)' }}>{((window.MACD_HIST||MACD_HIST).slice(-1)[0]||0).toFixed(2)}</span>
          </div>
          <svg viewBox="0 0 480 70" preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
            <line x1="0" x2="480" y1="35" y2="35" stroke="var(--hairline)" strokeWidth="0.5" />
            {macdTail.map((v, i) => {
              const x = (i / Math.max(1, macdTail.length - 1)) * 480;
              const maxAbs = Math.max(...macdTail.map(Math.abs), 0.01);
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
