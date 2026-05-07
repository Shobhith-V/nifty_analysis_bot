function Chart() {
  const [intervalSel, setIntervalSel] = React.useState('1m');
  const [showCPR,  setShowCPR]  = React.useState(true);
  const [showVWAP, setShowVWAP] = React.useState(true);
  const [showEMA,  setShowEMA]  = React.useState(true);
  const [showORB,  setShowORB]  = React.useState(true);
  const chartRef = React.useRef(null);
  const svgRef   = React.useRef(null);

  const INTERVAL_MINS = { '1m':1, '3m':3, '5m':5, '15m':15, '1h':60 };

  // ── Aggregation ────────────────────────────────────────────────────────
  function aggregate(base, mins) {
    if (!base || !base.length) return [];
    if (mins === 1) return base;

    // Session starts at 9:15 AM on the day of the first candle
    const d0 = new Date(base[0].t);
    d0.setHours(9, 15, 0, 0);
    const session0 = d0.getTime();
    const msPerBar = mins * 60000;

    const buckets = new Map();
    for (const c of base) {
      const slot = session0 + Math.floor((c.t - session0) / msPerBar) * msPerBar;
      if (!buckets.has(slot)) {
        const ts = new Date(slot);
        buckets.set(slot, {
          t:    slot,
          tStr: `${String(ts.getHours()).padStart(2,'0')}:${String(ts.getMinutes()).padStart(2,'0')}`,
          o: c.o, h: c.h, l: c.l, c: c.c, v: c.v,
        });
      } else {
        const b = buckets.get(slot);
        b.h = Math.max(b.h, c.h);
        b.l = Math.min(b.l, c.l);
        b.c = c.c;
        b.v += c.v;
      }
    }
    return [...buckets.values()].sort((a, b) => a.t - b.t);
  }

  // ── Local indicator helpers ─────────────────────────────────────────────
  const calcEMA = (arr, p) => {
    if (!arr.length) return [];
    const k = 2 / (p + 1);
    let e = arr[0];
    return arr.map(v => (e = v * k + e * (1 - k)));
  };
  const calcVWAP = (cds) => {
    let pv = 0, vol = 0;
    return cds.map(c => {
      const tp = (c.h + c.l + c.c) / 3;
      pv += tp * c.v;
      vol += c.v;
      return vol ? pv / vol : tp;
    });
  };
  const calcRSI = (closes, p = 14) => {
    const out = [];
    if (closes.length <= p) return closes.map(() => 50);
    let gains = 0, losses = 0;
    for (let i = 1; i <= p; i++) {
      const d = closes[i] - closes[i - 1];
      if (d > 0) gains += d; else losses -= d;
    }
    let avgG = gains / p, avgL = losses / p;
    for (let i = 0; i < p; i++) out.push(50); // warm-up
    out.push(100 - 100 / (1 + avgG / (avgL || 0.001)));
    for (let i = p + 1; i < closes.length; i++) {
      const d = closes[i] - closes[i - 1];
      avgG = (avgG * (p - 1) + Math.max(d, 0)) / p;
      avgL = (avgL * (p - 1) + Math.max(-d, 0)) / p;
      out.push(100 - 100 / (1 + avgG / (avgL || 0.001)));
    }
    return out;
  };
  const calcMACD = (closes) => {
    const e12 = calcEMA(closes, 12);
    const e26 = calcEMA(closes, 26);
    const line = e12.map((v, i) => v - e26[i]);
    const sig  = calcEMA(line, 9);
    return line.map((v, i) => v - sig[i]);
  };

  // ── Aggregated candle state ─────────────────────────────────────────────
  const [aggCandles, setAggCandles] = React.useState(() => window.CANDLES || CANDLES);

  const reAggregate = React.useCallback(() => {
    const base = window.CANDLES || CANDLES;
    const mins = INTERVAL_MINS[intervalSel] || 1;
    setAggCandles(aggregate(base, mins));
  }, [intervalSel]);

  // Re-aggregate on interval change or fresh data
  React.useEffect(() => { reAggregate(); }, [reAggregate]);

  React.useEffect(() => {
    // Full re-aggregate from window.CANDLES on:
    //  - initial data load (nifty-data-ready)
    //  - candle close from backend (nifty-candle) — locks in the closed bar
    document.addEventListener('nifty-data-ready', reAggregate);
    document.addEventListener('nifty-candle',     reAggregate);
    return () => {
      document.removeEventListener('nifty-data-ready', reAggregate);
      document.removeEventListener('nifty-candle',     reAggregate);
    };
  }, [reAggregate]);

  // Tick: update the LIVE (last) candle only.
  // Throttled to one React render per 500 ms so the chart doesn't flicker on every tick.
  // Also detects when a new candle minute has started and adds the new bar instead of
  // stamping the new price onto the just-closed bar.
  React.useEffect(() => {
    const pendingRef   = { current: null };     // setTimeout handle
    const intervalRef  = { current: intervalSel }; // keep intervalSel fresh without stale closure

    // Re-read intervalSel from the DOM via a ref whenever the effect re-runs
    intervalRef.current = intervalSel;

    const flush = () => {
      pendingRef.current = null;

      const ltp = window.LTP;
      if (!ltp || ltp <= 0) return;

      const liveCandle = window.LATEST;         // updated by data.jsx on every tick
      const liveT = liveCandle?.t ?? null;      // ms timestamp of live candle

      setAggCandles(prev => {
        if (!prev.length) return prev;
        const last = prev[prev.length - 1];
        const mins = INTERVAL_MINS[intervalRef.current] || 1;

        // Detect whether the tick belongs to a NEW candle bucket
        let inNewBucket = false;
        if (liveT != null) {
          const d0 = new Date(last.t); d0.setHours(9, 15, 0, 0);
          const session0  = d0.getTime();
          const msPerBar  = mins * 60000;
          const lastSlot  = session0 + Math.floor((last.t  - session0) / msPerBar) * msPerBar;
          const liveSlot  = session0 + Math.floor((liveT   - session0) / msPerBar) * msPerBar;
          inNewBucket = liveSlot > lastSlot;
        }

        if (inNewBucket && liveCandle) {
          // A new bar has started — append it rather than overwriting the closed bar
          const ts = new Date(liveT);
          const newBar = {
            t:    liveT,
            tStr: `${String(ts.getHours()).padStart(2,'0')}:${String(ts.getMinutes()).padStart(2,'0')}`,
            o: liveCandle.o, h: Math.max(liveCandle.h, ltp),
            l: Math.min(liveCandle.l, ltp), c: ltp, v: liveCandle.v || 0,
          };
          return [...prev, newBar];
        }

        // Same bar — update H/L/C in place
        const updated = { ...last,
          h: Math.max(last.h, ltp),
          l: Math.min(last.l, ltp),
          c: ltp,
        };
        return [...prev.slice(0, -1), updated];
      });
    };

    const onTick = () => {
      if (pendingRef.current) return;           // already scheduled
      pendingRef.current = setTimeout(flush, 500); // batch: max 2 renders/sec
    };

    document.addEventListener('nifty-tick', onTick);
    return () => {
      document.removeEventListener('nifty-tick', onTick);
      if (pendingRef.current) clearTimeout(pendingRef.current);
    };
  }, [intervalSel]); // re-bind when interval changes so intervalRef stays fresh

  // ── Pan + zoom state ────────────────────────────────────────────────────
  const N = aggCandles.length;
  const [viewSize, setViewSize] = React.useState(180);
  const [viewEnd,  setViewEnd]  = React.useState(N);
  const [stickLive, setStickLive] = React.useState(true);

  // Auto-stick right edge when new candles arrive
  React.useEffect(() => {
    if (stickLive) setViewEnd(aggCandles.length);
  }, [aggCandles.length, stickLive]);

  // Reset zoom/pan when interval switches
  React.useEffect(() => {
    setStickLive(true);
    setViewEnd(N);
    setViewSize(Math.min(180, N || 180));
  }, [intervalSel]);

  const end   = Math.max(1, Math.min(viewEnd || N, N));
  const size  = Math.max(20, Math.min(viewSize, Math.max(1, N)));
  const start = Math.max(0, end - size);
  const data  = aggCandles.slice(start, end);

  // ── Layout constants ────────────────────────────────────────────────────
  const W = 960, H = 460;
  const padL = 6, padR = 72, padT = 12, padB = 24;
  const plotW = W - padL - padR, plotH = H - padT - padB;

  // ── Indicators for current view ─────────────────────────────────────────
  // Compute from full aggCandles then slice to current view window
  const closes = aggCandles.map(c => c.c);
  const vwapFull  = showVWAP ? calcVWAP(aggCandles) : [];
  const ema9Full  = showEMA  ? calcEMA(closes, 9)   : [];
  const ema21Full = showEMA  ? calcEMA(closes, 21)  : [];
  const rsiFull   = calcRSI(closes, 14);
  const macdFull  = calcMACD(closes);

  const vwapTail = vwapFull.slice(start, end);
  const ema9Tail = ema9Full.slice(start, end);
  const ema21Tail = ema21Full.slice(start, end);
  const rsiTail  = rsiFull.slice(start, end);
  const macdTail = macdFull.slice(start, end);

  // Scalar readouts for legend
  const vwapNow   = vwapFull.length ? vwapFull[vwapFull.length - 1] : (window.VWAP || VWAP);
  const rsiNow    = rsiFull.length  ? rsiFull[rsiFull.length - 1]   : (window.RSI_NOW || RSI_NOW);
  const macdHNow  = macdFull.length ? macdFull[macdFull.length - 1] : 0;

  // ── Y-scale (include CPR lines in range) ───────────────────────────────
  const cpr = window.CPR_DAILY || CPR_DAILY;
  const orb = window.ORB_15   || ORB_15;

  const allVals = [
    ...data.map(c => c.h), ...data.map(c => c.l),
    cpr.tc, cpr.bc, cpr.pivot, cpr.r1, cpr.s1,
  ].filter(v => v != null && !isNaN(v));

  const yMin = allVals.length ? Math.min(...allVals) - 5 : 24000;
  const yMax = allVals.length ? Math.max(...allVals) + 5 : 25000;
  const yScale  = p => padT + (1 - (p - yMin) / (yMax - yMin)) * plotH;
  const xScale  = i => padL + (i / Math.max(1, data.length - 1)) * plotW;
  const candleW = Math.max(2, plotW / Math.max(1, data.length) * 0.7);

  const linePath = arr => arr
    .map((v, i) => v == null ? null : (i === 0 ? "M" : "L") + xScale(i).toFixed(1) + "," + yScale(v).toFixed(1))
    .filter(Boolean).join(" ");

  const yTicks = [];
  const tickStep = Math.ceil((yMax - yMin) / 10 / 25) * 25;
  for (let v = Math.ceil(yMin / tickStep) * tickStep; v <= yMax; v += tickStep) yTicks.push(v);

  const xTickStep = Math.max(1, Math.floor(data.length / 6));
  const xTicks = [];
  for (let i = 0; i < data.length; i += xTickStep) xTicks.push(i);

  const ltp = data.length ? data[data.length - 1].c : (window.LTP || LTP);

  // ── Drag / pan / zoom ──────────────────────────────────────────────────
  const dragRef = React.useRef(null);
  const onPointerDown = e => {
    e.target.setPointerCapture?.(e.pointerId);
    dragRef.current = { x: e.clientX, end, size };
    setStickLive(false);
  };
  const onPointerMove = e => {
    const d = dragRef.current;
    if (!d || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const dxCandles = ((e.clientX - d.x) / rect.width) * d.size;
    let newEnd = Math.round(d.end - dxCandles);
    newEnd = Math.max(d.size, Math.min(N, newEnd));
    setViewEnd(newEnd);
    if (newEnd >= N) setStickLive(true);
  };
  const onPointerUp = () => { dragRef.current = null; };
  const onWheel = e => {
    e.preventDefault();
    if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
      const dx = e.shiftKey ? e.deltaY : e.deltaX;
      const cPx = size / (svgRef.current?.getBoundingClientRect().width || 800);
      let newEnd = Math.round(end + dx * cPx);
      newEnd = Math.max(size, Math.min(N, newEnd));
      setViewEnd(newEnd);
      setStickLive(newEnd >= N);
    } else {
      const factor = e.deltaY > 0 ? 1.15 : 1 / 1.15;
      setViewSize(s => Math.max(20, Math.min(N, Math.round(s * factor))));
    }
  };
  const goLive  = ()       => { setStickLive(true); setViewEnd(N); };
  const zoom    = factor   => setViewSize(s => Math.max(20, Math.min(N, Math.round(s * factor))));
  const pan     = deltaC   => {
    const newEnd = Math.max(size, Math.min(N, end + deltaC));
    setViewEnd(newEnd);
    setStickLive(newEnd >= N);
  };

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div ref={chartRef} className="panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0 }}>

      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', rowGap: 4,
        padding: '6px 10px', borderBottom: '1px solid var(--hairline)', background: 'var(--bg-2)'
      }}>
        <span className="mono" style={{ fontSize: 10, letterSpacing: '0.1em', color: 'var(--dim)' }}>NIFTY 50 · INDEX</span>
        <span style={{ color: 'var(--hairline)' }}>│</span>

        {/* Interval buttons */}
        <div style={{ display: 'flex', gap: 0 }}>
          {['1m','3m','5m','15m','1h'].map(iv => (
            <button key={iv} onClick={() => setIntervalSel(iv)}
              className={"btn sm " + (intervalSel === iv ? "active" : "")}
              style={{ borderRadius: 0, marginLeft: -1 }}>
              {iv}
            </button>
          ))}
        </div>
        <span style={{ color: 'var(--hairline)' }}>│</span>
        <button className={"btn sm " + (showCPR  ? "active" : "")} onClick={() => setShowCPR(v=>!v)}>CPR</button>
        <button className={"btn sm " + (showVWAP ? "active" : "")} onClick={() => setShowVWAP(v=>!v)}>VWAP</button>
        <button className={"btn sm " + (showEMA  ? "active" : "")} onClick={() => setShowEMA(v=>!v)}>EMA 9·21</button>
        <button className={"btn sm " + (showORB  ? "active" : "")} onClick={() => setShowORB(v=>!v)}>ORB-15</button>
        <span style={{ color: 'var(--hairline)' }}>│</span>
        <button className="btn sm" onClick={() => pan(-Math.round(size * 0.25))}>‹</button>
        <button className="btn sm" onClick={() => pan( Math.round(size * 0.25))}>›</button>
        <button className="btn sm" onClick={() => zoom(1/1.3)}>+</button>
        <button className="btn sm" onClick={() => zoom(1.3)}>−</button>
        <button className={"btn sm " + (stickLive ? "active" : "")} onClick={goLive}>● LIVE</button>

        <div style={{ flex: 1 }} />
        {data.length > 0 && (
          <div className="mono" style={{ fontSize: 10, color: 'var(--dim)', display: 'flex', gap: 10 }}>
            <span>O <span style={{ color: 'var(--fg-2)' }}>{fmt(data[data.length-1]?.o)}</span></span>
            <span>H <span style={{ color: 'var(--green)' }}>{fmt(Math.max(...data.map(c=>c.h)))}</span></span>
            <span>L <span style={{ color: 'var(--red)' }}>{fmt(Math.min(...data.map(c=>c.l)))}</span></span>
            <span>C <span style={{ color: 'var(--fg)' }}>{fmt(ltp)}</span></span>
            <span>V <span style={{ color: 'var(--fg-2)' }}>{(data.reduce((s,c)=>s+(c.v||0),0)/1e6).toFixed(1)}M</span></span>
          </div>
        )}
        <button className="btn sm icon tooltip" data-tip="Fullscreen"
          onClick={() => {
            const el = chartRef.current;
            if (!document.fullscreenElement) el?.requestFullscreen?.().catch(()=>{});
            else document.exitFullscreen?.();
          }}>⛶</button>
      </div>

      {/* Main chart SVG */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, position: 'relative' }}>
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
          style={{ width: '100%', flex: '1 1 auto', display: 'block', minHeight: 0,
                   cursor: dragRef.current ? 'grabbing' : 'grab',
                   touchAction: 'none', userSelect: 'none' }}
          onPointerDown={onPointerDown} onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}     onPointerCancel={onPointerUp}
          onWheel={onWheel}>

          <defs>
            <pattern id="chartgrid" width="60" height="40" patternUnits="userSpaceOnUse">
              <path d="M 60 0 L 0 0 0 40" fill="none" stroke="var(--hairline-soft)" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect x={padL} y={padT} width={plotW} height={plotH} fill="url(#chartgrid)" />

          {/* Y axis */}
          {yTicks.map(v => (
            <g key={v}>
              <line x1={padL} x2={padL+plotW} y1={yScale(v)} y2={yScale(v)}
                stroke="var(--hairline-soft)" strokeWidth="0.5" strokeDasharray="2 4" />
              <text x={padL+plotW+6} y={yScale(v)+3} fontFamily="var(--mono)" fontSize="9" fill="var(--dim)">{fmt(v,0)}</text>
            </g>
          ))}

          {/* X axis labels */}
          {xTicks.map(i => (
            <text key={i} x={xScale(i)} y={H-8}
              fontFamily="var(--mono)" fontSize="9" fill="var(--dim)" textAnchor="middle">
              {data[i]?.tStr}
            </text>
          ))}

          {/* CPR band */}
          {showCPR && (
            <g>
              <rect x={padL} y={yScale(cpr.tc)} width={plotW}
                height={Math.max(1, yScale(cpr.bc) - yScale(cpr.tc))}
                fill="var(--cyan)" opacity="0.08" />
              <line x1={padL} x2={padL+plotW} y1={yScale(cpr.pivot)} y2={yScale(cpr.pivot)}
                stroke="var(--cyan)" strokeWidth="1.2" />
              <line x1={padL} x2={padL+plotW} y1={yScale(cpr.tc)} y2={yScale(cpr.tc)}
                stroke="var(--cyan)" strokeWidth="0.8" strokeDasharray="3 3" />
              <line x1={padL} x2={padL+plotW} y1={yScale(cpr.bc)} y2={yScale(cpr.bc)}
                stroke="var(--cyan)" strokeWidth="0.8" strokeDasharray="3 3" />
              {[['R1',cpr.r1,'var(--red)'],['S1',cpr.s1,'var(--green)']].map(([lbl,v,col])=>(
                <g key={lbl}>
                  <line x1={padL} x2={padL+plotW} y1={yScale(v)} y2={yScale(v)}
                    stroke={col} strokeWidth="0.6" strokeDasharray="1 4" opacity="0.6" />
                  <text x={padL+4} y={yScale(v)-3} fontFamily="var(--mono)" fontSize="8" fill={col} opacity="0.8">{lbl} {fmt(v)}</text>
                </g>
              ))}
              <text x={padL+4} y={yScale(cpr.pivot)-3} fontFamily="var(--mono)" fontSize="8" fill="var(--cyan)">P {fmt(cpr.pivot)}</text>
              <text x={padL+4} y={yScale(cpr.tc)-3}    fontFamily="var(--mono)" fontSize="8" fill="var(--cyan)" opacity="0.7">TC {fmt(cpr.tc)}</text>
              <text x={padL+4} y={yScale(cpr.bc)+9}    fontFamily="var(--mono)" fontSize="8" fill="var(--cyan)" opacity="0.7">BC {fmt(cpr.bc)}</text>
            </g>
          )}

          {/* ORB band — only show when viewing from session start and on 1m */}
          {showORB && start === 0 && intervalSel === '1m' && orb && (
            <g>
              <rect x={xScale(0)} y={yScale(orb.high)}
                width={Math.max(0, xScale(Math.min(15, data.length-1)) - xScale(0))}
                height={Math.max(1, yScale(orb.low) - yScale(orb.high))}
                fill="var(--amber)" opacity="0.10" />
              <line x1={padL} x2={padL+plotW} y1={yScale(orb.high)} y2={yScale(orb.high)}
                stroke="var(--amber)" strokeWidth="0.6" strokeDasharray="2 3" opacity="0.7" />
              <line x1={padL} x2={padL+plotW} y1={yScale(orb.low)} y2={yScale(orb.low)}
                stroke="var(--amber)" strokeWidth="0.6" strokeDasharray="2 3" opacity="0.7" />
              <text x={padL+plotW-80} y={yScale(orb.high)-3} fontFamily="var(--mono)" fontSize="8" fill="var(--amber)">ORB-H {fmt(orb.high)}</text>
              <text x={padL+plotW-80} y={yScale(orb.low)+9}  fontFamily="var(--mono)" fontSize="8" fill="var(--amber)">ORB-L {fmt(orb.low)}</text>
            </g>
          )}

          {/* VWAP */}
          {showVWAP && vwapTail.length > 1 && (
            <path d={linePath(vwapTail)} fill="none" stroke="var(--violet)" strokeWidth="1.4" />
          )}

          {/* EMA 9 + 21 */}
          {showEMA && ema9Tail.length > 1 && (
            <>
              <path d={linePath(ema9Tail)}  fill="none" stroke="var(--amber)" strokeWidth="1" opacity="0.85" />
              <path d={linePath(ema21Tail)} fill="none" stroke="var(--cyan)"  strokeWidth="1" opacity="0.70" />
            </>
          )}

          {/* Candles */}
          {data.map((c, i) => {
            const x   = xScale(i);
            const up  = c.c >= c.o;
            const col = up ? "var(--green)" : "var(--red)";
            const isLive = i === data.length - 1 && stickLive;
            return (
              <g key={start + i}>
                <line x1={x} x2={x} y1={yScale(c.h)} y2={yScale(c.l)} stroke={col} strokeWidth="1" />
                <rect
                  x={x - candleW/2}
                  y={yScale(Math.max(c.o, c.c))}
                  width={candleW}
                  height={Math.max(1, Math.abs(yScale(c.o) - yScale(c.c)))}
                  fill={col}
                  opacity={isLive ? 0.75 : 1}   // live candle slightly transparent
                />
              </g>
            );
          })}

          {/* LTP price line */}
          <line x1={padL} x2={padL+plotW} y1={yScale(ltp)} y2={yScale(ltp)}
            stroke="var(--cyan)" strokeWidth="1" strokeDasharray="4 3" opacity="0.9" />
          <rect x={padL+plotW+2} y={yScale(ltp)-9} width={68} height={18} fill="var(--cyan)" />
          <text x={padL+plotW+6} y={yScale(ltp)+3.5}
            fontFamily="var(--mono)" fontSize="10" fontWeight="600" fill="var(--bg)">{fmt(ltp)}</text>
        </svg>

        {/* Legend overlay */}
        <div style={{
          position: 'absolute', top: 10, left: 10,
          display: 'flex', flexDirection: 'column', gap: 3,
          fontFamily: 'var(--mono)', fontSize: 10,
          background: 'oklch(0.20 0.014 250 / 0.85)',
          padding: '6px 10px', borderRadius: 3, border: '1px solid var(--hairline)',
          pointerEvents: 'none',
        }}>
          {showVWAP && <div><span style={{color:'var(--violet)'}}>━</span> <span style={{color:'var(--dim)'}}>VWAP</span> <span style={{color:'var(--fg-2)'}}>{fmt(vwapNow)}</span></div>}
          {showEMA   && <div><span style={{color:'var(--amber)'}}>━</span> <span style={{color:'var(--dim)'}}>EMA9</span></div>}
          {showEMA   && <div><span style={{color:'var(--cyan)'}}>━</span>  <span style={{color:'var(--dim)'}}>EMA21</span></div>}
          {showCPR   && <div><span style={{color:'var(--cyan)'}}>▭</span>  <span style={{color:'var(--dim)'}}>CPR</span> <span style={{color:'var(--fg-2)'}}>{fmt(cpr.bc)}–{fmt(cpr.tc)}</span></div>}
          <div style={{marginTop:2, color:'var(--dim-2)', fontSize:9}}>
            {intervalSel} · {data.length} bars · {stickLive ? 'LIVE' : `${start+1}–${end} of ${N}`}
          </div>
        </div>

        <div style={{position:'absolute',bottom:6,right:80,fontFamily:'var(--mono)',fontSize:9,color:'var(--dim-2)',pointerEvents:'none'}}>
          drag to pan · wheel to zoom · shift+wheel to scroll
        </div>
      </div>

      {/* Volume sub-pane */}
      <div style={{ height: 52, borderTop: '1px solid var(--hairline)', background: 'oklch(0.18 0.013 250)' }}>
        <svg viewBox={`0 0 ${W} 50`} preserveAspectRatio="none" style={{ width: '100%', height: 50 }}>
          {data.map((c, i) => {
            const maxV = Math.max(...data.map(d => d.v || 0), 1);
            const h = ((c.v || 0) / maxV) * 46;
            const up = c.c >= c.o;
            return (
              <rect key={start+i} x={xScale(i)-candleW/2} y={50-h}
                width={candleW} height={h}
                fill={up ? "var(--green)" : "var(--red)"} opacity="0.55" />
            );
          })}
        </svg>
      </div>

      {/* RSI / MACD sub-panes */}
      <div style={{ height: 70, borderTop: '1px solid var(--hairline)',
        display: 'grid', gridTemplateColumns: '1fr 1fr', background: 'oklch(0.18 0.013 250)' }}>

        <div style={{ position: 'relative', borderRight: '1px solid var(--hairline)' }}>
          <div className="mono" style={{ position:'absolute', top:4, left:6, fontSize:9, color:'var(--dim)', display:'flex', gap:6, zIndex:2 }}>
            <span>RSI(14)</span>
            <span style={{ color: rsiNow > 70 ? 'var(--red)' : rsiNow < 30 ? 'var(--green)' : 'var(--cyan)' }}>
              {rsiNow.toFixed(1)}
            </span>
          </div>
          <svg viewBox="0 0 480 70" preserveAspectRatio="none" style={{ width:'100%', height:'100%' }}>
            <line x1="0" x2="480" y1="14" y2="14" stroke="var(--red)"   strokeWidth="0.5" strokeDasharray="2 3" opacity="0.5" />
            <line x1="0" x2="480" y1="56" y2="56" stroke="var(--green)" strokeWidth="0.5" strokeDasharray="2 3" opacity="0.5" />
            <line x1="0" x2="480" y1="35" y2="35" stroke="var(--hairline)" strokeWidth="0.5" />
            {rsiTail.length > 1 && (
              <path d={rsiTail.map((v,i) => {
                const x = (i / Math.max(1, rsiTail.length-1)) * 480;
                const y = 70 - (v / 100) * 70;
                return (i===0?"M":"L") + x.toFixed(1) + "," + y.toFixed(1);
              }).join(" ")} fill="none" stroke="var(--cyan)" strokeWidth="1" />
            )}
          </svg>
        </div>

        <div style={{ position: 'relative' }}>
          <div className="mono" style={{ position:'absolute', top:4, left:6, fontSize:9, color:'var(--dim)', display:'flex', gap:6, zIndex:2 }}>
            <span>MACD(12,26,9)</span>
            <span style={{ color: macdHNow >= 0 ? 'var(--green)' : 'var(--red)' }}>{macdHNow.toFixed(2)}</span>
          </div>
          <svg viewBox="0 0 480 70" preserveAspectRatio="none" style={{ width:'100%', height:'100%' }}>
            <line x1="0" x2="480" y1="35" y2="35" stroke="var(--hairline)" strokeWidth="0.5" />
            {macdTail.length > 1 && (() => {
              const maxAbs = Math.max(...macdTail.map(Math.abs), 0.01);
              return macdTail.map((v,i) => {
                const x = (i / Math.max(1, macdTail.length-1)) * 480;
                const h = (Math.abs(v) / maxAbs) * 30;
                return <rect key={i} x={x-0.8} y={v>=0?35-h:35} width="1.6" height={h}
                  fill={v>=0?"var(--green)":"var(--red)"} opacity="0.7" />;
              });
            })()}
          </svg>
        </div>
      </div>
    </div>
  );
}

window.Chart = Chart;
