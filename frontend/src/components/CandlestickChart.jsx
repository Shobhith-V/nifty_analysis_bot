import { useEffect, useRef, useState, useCallback } from 'react'
import { createChart, CrosshairMode, LineStyle } from 'lightweight-charts'
import { useStore } from '../store/useStore'

const INTERVALS = ['1m', '3m', '5m', '15m']

const CPR_COLORS = {
  tc: '#4da6ff',
  bc: '#4da6ff',
  pivot: '#ffd700',
  r1: '#ff8099', r2: '#ff4d6d', r3: '#ff1a3d',
  s1: '#66ffcc', s2: '#00c896', s3: '#009970',
}

export default function CandlestickChart() {
  const chartRef = useRef(null)
  const containerRef = useRef(null)
  const seriesRef = useRef({})
  const cprLinesRef = useRef([])

  const candles = useStore(s => s.candles)
  const liveCandle = useStore(s => s.liveCandle)
  const cpr = useStore(s => s.cpr)
  const gap = useStore(s => s.gap)
  const orb = useStore(s => s.orb)
  const vwapSeries = useStore(s => s.vwapSeries)
  const fetchCandles = useStore(s => s.fetchCandles)
  const interval = useStore(s => s.interval)

  const [showEMA, setShowEMA] = useState(true)
  const [showVWAP, setShowVWAP] = useState(true)
  const [showCPR, setShowCPR] = useState(true)

  // Init chart
  useEffect(() => {
    if (!containerRef.current) return

    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: '#0a0a0f' },
        textColor: '#8888aa',
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: '#1e1e2e' },
        horzLines: { color: '#1e1e2e' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: '#4a4a6a', labelBackgroundColor: '#12121a' },
        horzLine: { color: '#4a4a6a', labelBackgroundColor: '#12121a' },
      },
      rightPriceScale: {
        borderColor: '#1e1e2e',
        scaleMargins: { top: 0.1, bottom: 0.25 },
      },
      timeScale: {
        borderColor: '#1e1e2e',
        timeVisible: true,
        secondsVisible: false,
        tickMarkFormatter: (time) => {
          const d = new Date(time * 1000)
          return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' })
        },
      },
      handleScroll: { mouseWheel: true, pressedMouseMove: true },
      handleScale: { mouseWheel: true, pinch: true },
    })

    // Candlestick series
    const candleSeries = chart.addCandlestickSeries({
      upColor: '#00c896',
      downColor: '#ff4d6d',
      borderUpColor: '#00c896',
      borderDownColor: '#ff4d6d',
      wickUpColor: '#00c896',
      wickDownColor: '#ff4d6d',
    })

    // Volume series
    const volumeSeries = chart.addHistogramSeries({
      color: '#7c3aed',
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    })
    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    })

    // VWAP
    const vwapLine = chart.addLineSeries({
      color: '#b57bee',
      lineWidth: 2,
      lineStyle: LineStyle.Dashed,
      priceLineVisible: false,
      lastValueVisible: true,
      title: 'VWAP',
    })

    // EMAs
    const ema9 = chart.addLineSeries({
      color: '#ff8c00',
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: true,
      title: 'EMA9',
    })
    const ema21 = chart.addLineSeries({
      color: '#4da6ff',
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: true,
      title: 'EMA21',
    })
    const ema50 = chart.addLineSeries({
      color: '#9d5cff',
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: true,
      title: 'EMA50',
    })

    seriesRef.current = { chart, candleSeries, volumeSeries, vwapLine, ema9, ema21, ema50 }
    chartRef.current = chart

    // Resize observer
    const ro = new ResizeObserver(() => {
      if (containerRef.current) {
        chart.applyOptions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        })
      }
    })
    ro.observe(containerRef.current)

    return () => {
      ro.disconnect()
      chart.remove()
      chartRef.current = null
      seriesRef.current = {}
    }
  }, [])

  // Update candles + volume
  useEffect(() => {
    const { candleSeries, volumeSeries } = seriesRef.current
    if (!candleSeries || !candles.length) return

    const sorted = [...candles].sort((a, b) => a.time - b.time)
    candleSeries.setData(sorted)

    const volData = sorted.map(c => ({
      time: c.time,
      value: c.volume,
      color: c.close >= c.open ? 'rgba(0,200,150,0.5)' : 'rgba(255,77,109,0.5)',
    }))
    volumeSeries.setData(volData)
  }, [candles])

  // Update live candle
  useEffect(() => {
    if (!liveCandle || !seriesRef.current.candleSeries) return
    try {
      seriesRef.current.candleSeries.update(liveCandle)
      if (seriesRef.current.volumeSeries) {
        seriesRef.current.volumeSeries.update({
          time: liveCandle.time,
          value: liveCandle.volume,
          color: liveCandle.close >= liveCandle.open ? 'rgba(0,200,150,0.5)' : 'rgba(255,77,109,0.5)',
        })
      }
    } catch {}
  }, [liveCandle])

  // VWAP
  useEffect(() => {
    const { vwapLine } = seriesRef.current
    if (!vwapLine || !vwapSeries.length || !showVWAP) return
    vwapLine.setData(vwapSeries)
  }, [vwapSeries, showVWAP])

  // CPR horizontal lines
  useEffect(() => {
    const { chart } = seriesRef.current
    if (!chart || !cpr?.daily || !showCPR) return

    // Remove old CPR lines
    cprLinesRef.current.forEach(s => {
      try { chart.removeSeries(s) } catch {}
    })
    cprLinesRef.current = []

    const d = cpr.daily
    const levels = [
      { key: 'tc', label: 'TC' }, { key: 'bc', label: 'BC' },
      { key: 'pivot', label: 'Pivot' },
      { key: 'r1', label: 'R1' }, { key: 'r2', label: 'R2' }, { key: 'r3', label: 'R3' },
      { key: 's1', label: 'S1' }, { key: 's2', label: 'S2' }, { key: 's3', label: 'S3' },
    ]

    if (candles.length === 0) return
    const firstTime = candles[0]?.time
    const lastTime = candles[candles.length - 1]?.time

    levels.forEach(({ key, label }) => {
      const val = d[key]
      if (!val || !firstTime) return
      const line = chart.addLineSeries({
        color: CPR_COLORS[key],
        lineWidth: key === 'pivot' ? 2 : 1,
        lineStyle: LineStyle.Dotted,
        priceLineVisible: false,
        lastValueVisible: true,
        title: label,
      })
      line.setData([
        { time: firstTime, value: val },
        { time: lastTime + 3600, value: val },
      ])
      cprLinesRef.current.push(line)
    })
  }, [cpr, candles, showCPR])

  const handleIntervalChange = useCallback((iv) => {
    fetchCandles(iv)
  }, [fetchCandles])

  return (
    <div className="bg-terminal-card rounded-lg border border-terminal-border p-4 flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-3 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-terminal-text font-sans font-semibold text-sm">NIFTY 50</span>
          <span className="text-terminal-text-dim font-mono text-xs">NSE:NIFTY</span>
        </div>
        <div className="flex items-center gap-3">
          {/* Interval buttons */}
          <div className="flex gap-1">
            {INTERVALS.map(iv => (
              <button
                key={iv}
                onClick={() => handleIntervalChange(iv)}
                className={`px-2 py-1 text-xs font-mono rounded transition-colors ${
                  interval === iv
                    ? 'bg-terminal-accent text-white'
                    : 'bg-terminal-border text-terminal-text-dim hover:bg-terminal-border/80'
                }`}
              >
                {iv}
              </button>
            ))}
          </div>
          {/* Toggle buttons */}
          <div className="flex gap-1">
            <button
              onClick={() => setShowVWAP(v => !v)}
              className={`px-2 py-1 text-xs font-mono rounded transition-colors ${
                showVWAP ? 'bg-terminal-purple/30 text-terminal-purple' : 'bg-terminal-border text-terminal-muted'
              }`}
            >
              VWAP
            </button>
            <button
              onClick={() => setShowEMA(v => !v)}
              className={`px-2 py-1 text-xs font-mono rounded transition-colors ${
                showEMA ? 'bg-terminal-blue/30 text-terminal-blue' : 'bg-terminal-border text-terminal-muted'
              }`}
            >
              EMA
            </button>
            <button
              onClick={() => setShowCPR(v => !v)}
              className={`px-2 py-1 text-xs font-mono rounded transition-colors ${
                showCPR ? 'bg-terminal-accent/30 text-terminal-accent' : 'bg-terminal-border text-terminal-muted'
              }`}
            >
              CPR
            </button>
          </div>
        </div>
      </div>

      {/* Gap / ORB info bar */}
      {(gap?.gap_type || orb?.['15m']?.status) && (
        <div className="flex items-center gap-2 mb-2 shrink-0 flex-wrap">
          {gap?.gap_type && gap.gap_type !== 'FLAT_OPEN' && (
            <span className={`text-xs font-mono px-2 py-0.5 rounded border ${
              gap.gap_type.includes('UP')
                ? 'bg-terminal-green/10 text-terminal-green border-terminal-green/30'
                : 'bg-terminal-red/10 text-terminal-red border-terminal-red/30'
            }`}>
              {gap.gap_type.replace(/_/g, ' ')} {gap.gap_pct > 0 ? '+' : ''}{gap.gap_pct?.toFixed(2)}%
            </span>
          )}
          {orb?.['15m']?.status && orb['15m'].status !== 'INSIDE_RANGE' && (
            <span className={`text-xs font-mono px-2 py-0.5 rounded border ${
              orb['15m'].status.includes('BREAKOUT')
                ? 'bg-terminal-green/10 text-terminal-green border-terminal-green/30'
                : 'bg-terminal-red/10 text-terminal-red border-terminal-red/30'
            }`}>
              15m ORB: {orb['15m'].status.replace(/_/g, ' ')}
            </span>
          )}
          {gap?.fill?.fill_pct < 100 && gap?.gap_type !== 'FLAT_OPEN' && (
            <span className="text-xs font-mono px-2 py-0.5 rounded border bg-terminal-yellow/10 text-terminal-yellow border-terminal-yellow/30">
              Gap Fill: {gap.fill.fill_pct?.toFixed(0)}%
            </span>
          )}
        </div>
      )}

      {/* Chart */}
      <div
        ref={containerRef}
        className="flex-1 rounded overflow-hidden chart-container"
        style={{ minHeight: '380px' }}
      />

      {/* Legend */}
      <div className="flex items-center gap-4 mt-2 shrink-0 flex-wrap">
        {showVWAP && (
          <div className="flex items-center gap-1">
            <div className="w-6 h-0.5 bg-terminal-purple rounded" style={{ borderStyle: 'dashed' }} />
            <span className="text-xs font-mono text-terminal-text-dim">VWAP</span>
          </div>
        )}
        {showEMA && (
          <>
            <div className="flex items-center gap-1">
              <div className="w-4 h-0.5 rounded" style={{ backgroundColor: '#ff8c00' }} />
              <span className="text-xs font-mono text-terminal-text-dim">EMA9</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-4 h-0.5 rounded" style={{ backgroundColor: '#4da6ff' }} />
              <span className="text-xs font-mono text-terminal-text-dim">EMA21</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-4 h-0.5 rounded" style={{ backgroundColor: '#9d5cff' }} />
              <span className="text-xs font-mono text-terminal-text-dim">EMA50</span>
            </div>
          </>
        )}
        {showCPR && (
          <>
            <div className="flex items-center gap-1">
              <div className="w-4 h-0.5 rounded" style={{ backgroundColor: '#ffd700' }} />
              <span className="text-xs font-mono text-terminal-text-dim">Pivot</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-4 h-0.5 rounded" style={{ backgroundColor: '#4da6ff' }} />
              <span className="text-xs font-mono text-terminal-text-dim">TC/BC</span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
