// Mock data generator — tuned to look like real Nifty 50 values
const NIFTY_BASE = 24830;

// Deterministic pseudo-random
function mulberry32(seed) {
  return function() {
    let t = (seed += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function genCandles(seed = 42) {
  const rng = mulberry32(seed);
  const candles = [];
  // 9:15 AM IST start, 1m bars; we'll do ~280 bars (~4.5h elapsed)
  let price = 24795 + (rng() - 0.5) * 30; // open near base
  let trend = 0.06; // slight uptrend
  const start = new Date();
  start.setHours(9, 15, 0, 0);

  for (let i = 0; i < 280; i++) {
    const t = new Date(start.getTime() + i * 60 * 1000);
    // Modulate trend across the session for shape
    const phase = i / 280;
    const session = Math.sin(phase * Math.PI * 2.3) * 0.4 + Math.cos(phase * 7) * 0.18;
    const noise = (rng() - 0.5) * 7;
    const drift = trend * (1 + session) + noise;

    const o = price;
    const c = o + drift;
    const wick = Math.abs(drift) + rng() * 3 + 1.5;
    const h = Math.max(o, c) + rng() * wick;
    const l = Math.min(o, c) - rng() * wick;
    const v = Math.floor(180000 + rng() * 540000 + (Math.abs(drift) * 25000));

    candles.push({
      t: t.getTime(),
      tStr: t.toTimeString().slice(0, 5),
      o: +o.toFixed(2),
      h: +h.toFixed(2),
      l: +l.toFixed(2),
      c: +c.toFixed(2),
      v
    });
    price = c;
  }
  return candles;
}

const CANDLES = genCandles(7);
const LATEST = CANDLES[CANDLES.length - 1];
const FIRST = CANDLES[0];
const PREV_CLOSE = 24791.45;
const TODAY_OPEN = FIRST.o;
const LTP = LATEST.c;

// CPR
function calcCPR(h, l, c) {
  const pivot = (h + l + c) / 3;
  const bc = (h + l) / 2;
  const tc = (pivot - bc) + pivot;
  return {
    pivot: +pivot.toFixed(2),
    bc: +Math.min(bc, tc).toFixed(2),
    tc: +Math.max(bc, tc).toFixed(2),
    r1: +((2 * pivot) - l).toFixed(2),
    r2: +(pivot + (h - l)).toFixed(2),
    r3: +(h + 2 * (pivot - l)).toFixed(2),
    s1: +((2 * pivot) - h).toFixed(2),
    s2: +(pivot - (h - l)).toFixed(2),
    s3: +(l - 2 * (h - pivot)).toFixed(2),
  };
}
const PREV_HIGH = 24858.10;
const PREV_LOW = 24762.80;
const CPR_DAILY = calcCPR(PREV_HIGH, PREV_LOW, PREV_CLOSE);
const CPR_WEEKLY = calcCPR(24960, 24612, 24791.45);

const GAP_PTS = TODAY_OPEN - PREV_CLOSE;
const GAP_PCT = (GAP_PTS / PREV_CLOSE) * 100;

// ORB (first 15 mins)
const ORB_15 = (() => {
  const slice = CANDLES.slice(0, 15);
  return {
    high: +Math.max(...slice.map(c => c.h)).toFixed(2),
    low: +Math.min(...slice.map(c => c.l)).toFixed(2),
  };
})();

// Indicators (rough)
function ema(arr, p) {
  const k = 2 / (p + 1);
  let e = arr[0];
  return arr.map(v => (e = v * k + e * (1 - k)));
}
const closes = CANDLES.map(c => c.c);
const EMA9 = ema(closes, 9);
const EMA21 = ema(closes, 21);
const EMA50 = ema(closes, 50);
const VWAP_SERIES = (() => {
  let cumPV = 0, cumV = 0;
  return CANDLES.map(c => {
    const tp = (c.h + c.l + c.c) / 3;
    cumPV += tp * c.v;
    cumV += c.v;
    return cumPV / cumV;
  });
})();
const VWAP = VWAP_SERIES[VWAP_SERIES.length - 1];

function rsi(arr, p = 14) {
  const out = [];
  let gains = 0, losses = 0;
  for (let i = 1; i <= p; i++) {
    const d = arr[i] - arr[i - 1];
    if (d > 0) gains += d; else losses -= d;
  }
  let avgG = gains / p, avgL = losses / p;
  out.push(100 - 100 / (1 + avgG / (avgL || 1)));
  for (let i = p + 1; i < arr.length; i++) {
    const d = arr[i] - arr[i - 1];
    avgG = (avgG * (p - 1) + Math.max(d, 0)) / p;
    avgL = (avgL * (p - 1) + Math.max(-d, 0)) / p;
    out.push(100 - 100 / (1 + avgG / (avgL || 1)));
  }
  return out;
}
const RSI = rsi(closes, 14);
const RSI_NOW = RSI[RSI.length - 1];

const MACD_LINE = (() => {
  const e12 = ema(closes, 12);
  const e26 = ema(closes, 26);
  return e12.map((v, i) => v - e26[i]);
})();
const MACD_SIGNAL = ema(MACD_LINE, 9);
const MACD_HIST = MACD_LINE.map((v, i) => v - MACD_SIGNAL[i]);

// Bias score
const BIAS_SCORE = 6.4; // out of 10
const BIAS_LABEL = "BULLISH";

// Signals
const SIGNALS = [
  { t: "13:42", type: "MACD_BULLISH_CROSS", dir: "BULLISH", conf: 4, px: 24831.20, desc: "MACD histogram flipped positive" },
  { t: "13:18", type: "BULLISH_ENGULFING", dir: "BULLISH", conf: 4, px: 24812.05, desc: "Engulfing at VWAP support" },
  { t: "12:55", type: "VWAP_RECLAIM", dir: "BULLISH", conf: 3, px: 24805.80, desc: "Price reclaimed VWAP after pullback" },
  { t: "11:32", type: "DOJI_AT_PIVOT", dir: "NEUTRAL", conf: 4, px: 24804.10, desc: "Doji rejection at daily pivot" },
  { t: "10:48", type: "ORB_BREAKOUT", dir: "BULLISH", conf: 5, px: 24788.40, desc: "ORB-15 breakout, volume confirmed (1.8x)" },
  { t: "10:12", type: "RSI_OVERSOLD_REVERSAL", dir: "BULLISH", conf: 3, px: 24759.65, desc: "RSI bounced from 28" },
  { t: "09:32", type: "GAP_FILL_PARTIAL", dir: "BEARISH", conf: 2, px: 24784.20, desc: "Gap 64% filled, sellers active" },
];

// Global markets
const GLOBAL_MARKETS = [
  { sym: "GIFT NIFTY", px: 24862.50, chg: 0.31, time: "Now" },
  { sym: "DOW JONES",  px: 41842.10, chg: -0.18, time: "Closed" },
  { sym: "NASDAQ",     px: 18127.30, chg: 0.45, time: "Closed" },
  { sym: "S&P 500",    px:  5728.40, chg: 0.12, time: "Closed" },
  { sym: "FTSE 100",   px:  8240.15, chg: -0.22, time: "Closed" },
  { sym: "NIKKEI 225", px: 38972.60, chg: 0.83, time: "Open" },
  { sym: "HANG SENG",  px: 22148.20, chg: 1.24, time: "Open" },
  { sym: "DAX",        px: 19130.80, chg: 0.06, time: "Open" },
  { sym: "BRENT",      px:    73.84, chg: -0.41, time: "—" },
  { sym: "GOLD",       px:  2658.20, chg: 0.27, time: "—" },
  { sym: "USD/INR",    px:    84.12, chg: 0.04, time: "—" },
  { sym: "VIX INDIA",  px:    13.24, chg: -2.18, time: "—" },
];

// News
const NEWS = [
  { src: "Reuters",    t: "2m",  headline: "RBI holds repo rate at 6.50%, maintains stance neutral", impact: "neutral" },
  { src: "Bloomberg",  t: "12m", headline: "FII net buy ₹1,842 cr in cash segment ahead of expiry", impact: "bullish" },
  { src: "Mint",       t: "28m", headline: "Auto sales beat estimates; Maruti, Tata Motors lead", impact: "bullish" },
  { src: "ET Markets", t: "47m", headline: "IT sector under pressure as TCS guides Q3 cautious", impact: "bearish" },
  { src: "CNBC-TV18",  t: "1h",  headline: "GIFT Nifty signals positive open for Monday", impact: "bullish" },
  { src: "MoneyControl", t: "2h", headline: "Crude oil falls 1.2% on demand concerns from China", impact: "bullish" },
];

// Polymarket
const POLY = [
  { q: "Will Nifty close above 25,000 by Dec 31?", yes: 64, vol: "$184k" },
  { q: "Will RBI cut rates in Q1 2026?",            yes: 32, vol: "$92k" },
  { q: "Will USD/INR breach 85 in 2025?",           yes: 71, vol: "$148k" },
  { q: "Will FII be net buyers in Nov?",            yes: 48, vol: "$62k" },
];

// AI commentary stream
const AI_LOG = [
  { t: "13:44:02", msg: "Price holding above VWAP for 38 minutes. Bullish structure intact." },
  { t: "13:42:18", msg: "MACD histogram flipped positive — momentum confirms uptrend bias from CPR." },
  { t: "13:38:55", msg: "Volume on last 3 bars 1.4× session avg. Watching 24,850 resistance." },
  { t: "13:31:10", msg: "Sectoral rotation noted: Banks +0.6%, IT -0.3%. Index lift driven by BankNifty." },
  { t: "13:18:42", msg: "Bullish engulfing at VWAP — high probability continuation setup." },
  { t: "12:55:08", msg: "Reclaim of VWAP after 12-bar dip. Bias shifting bullish-intraday." },
];

// Pre-market checklist
const CHECKLIST = [
  { id: "auth",     label: "Angel One session authenticated",         done: true,  detail: "Last login 08:42 IST" },
  { id: "ws",       label: "Live WebSocket feed connected",            done: true,  detail: "5,824 ticks received" },
  { id: "prev",     label: "Previous day OHLC fetched",                done: true,  detail: "H 24858.10 / L 24762.80 / C 24791.45" },
  { id: "cpr",      label: "Daily CPR calculated",                     done: true,  detail: "Width 0.12% — Narrow" },
  { id: "global",   label: "Global cues — SGX, Dow, Asia",             done: true,  detail: "GIFT Nifty +0.31%" },
  { id: "news",     label: "Overnight news scanned",                   done: true,  detail: "RBI policy, FII flows" },
  { id: "expiry",   label: "Expiry / event calendar checked",          done: false, detail: "Weekly expiry — Thu" },
  { id: "strategy", label: "Strategy rules loaded into engine",        done: false, detail: "VWAP-Reclaim_v3 inactive" },
];

// Backtest equity
const EQUITY = (() => {
  const out = [];
  let v = 100000;
  let r = mulberry32(11);
  for (let i = 0; i < 120; i++) {
    v += (r() - 0.42) * 1800;
    out.push({ d: i, v: +v.toFixed(0) });
  }
  return out;
})();

const BACKTEST = {
  strategy: "CPR-Bias + VWAP-Reclaim",
  period: "01 Jan 2025 — 30 Apr 2026",
  trades: 248,
  winRate: 58.4,
  avgWin: 0.62,
  avgLoss: -0.38,
  profitFactor: 2.07,
  maxDD: -8.4,
  sharpe: 1.92,
  netReturn: 41.8,
  equity: EQUITY,
};

// Strategy DSL example
const DSL_TEXT = `# CPR Bias + VWAP Reclaim
when session.time == "09:30"
  and price > cpr.pivot
  and gap.pct between -0.4 and 0.6
  and sgx_nifty.change_pct > 0
then bias = LONG, confidence = 0.7

when price.crosses_above(vwap)
  and rsi(14) > 50
  and volume > avg_volume(10) * 1.4
then signal "VWAP_RECLAIM_LONG"
  target = cpr.r1
  stop = vwap - atr(14) * 1.2

when price.crosses_below(cpr.bc)
  and macd.hist < 0
then signal "CPR_BREAKDOWN"
  target = cpr.s1
  stop = cpr.pivot`;

Object.assign(window, {
  CANDLES, LATEST, FIRST, PREV_CLOSE, TODAY_OPEN, LTP, PREV_HIGH, PREV_LOW,
  CPR_DAILY, CPR_WEEKLY, GAP_PTS, GAP_PCT, ORB_15,
  EMA9, EMA21, EMA50, VWAP_SERIES, VWAP,
  RSI, RSI_NOW, MACD_LINE, MACD_SIGNAL, MACD_HIST,
  BIAS_SCORE, BIAS_LABEL, SIGNALS, GLOBAL_MARKETS, NEWS, POLY, AI_LOG,
  CHECKLIST, BACKTEST, DSL_TEXT,
});

// ─── Live API integration ──────────────────────────────────────────────────
(function() {
  const API_BASE = (window.location.port === '8000' || window.location.port === '')
    ? ''
    : 'http://localhost:8000';
  const WS_PROTO = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const WS_BASE = (window.location.port === '8000' || window.location.port === '')
    ? `${WS_PROTO}//${window.location.host}`
    : 'ws://localhost:8000';

  function toFrontendCandle(c) {
    const ts = new Date(c.time * 1000);
    return {
      t: c.time * 1000,
      tStr: `${String(ts.getHours()).padStart(2,'0')}:${String(ts.getMinutes()).padStart(2,'0')}`,
      o: c.open, h: c.high, l: c.low, c: c.close, v: c.volume,
    };
  }

  async function initLiveData() {
    try {
      // Step 1: refresh all derived state via dashboard endpoint
      const dashboard = await fetch(`${API_BASE}/api/dashboard`).then(r => r.json());

      // Step 2: fetch raw candles + full indicator series in parallel
      const [candleResp, indSeries] = await Promise.all([
        fetch(`${API_BASE}/api/market/nifty/today?interval=1m`).then(r => r.json()).catch(() => null),
        fetch(`${API_BASE}/api/indicators`).then(r => r.json()).catch(() => null),
      ]);

      // ── Candles ──────────────────────────────────────────────────────────
      if (candleResp && candleResp.candles && candleResp.candles.length > 0) {
        window.CANDLES = candleResp.candles.map(toFrontendCandle);
        window.FIRST  = window.CANDLES[0];
        window.LATEST = window.CANDLES[window.CANDLES.length - 1];
        window.LTP        = window.LATEST.c;
        window.TODAY_OPEN = window.FIRST.o;
      }

      // ── Indicator series (chart overlays) ─────────────────────────────
      if (indSeries && !indSeries.error && indSeries.vwap) {
        const last = arr => arr && arr.length ? arr[arr.length - 1] : null;
        if (indSeries.vwap)       { window.VWAP_SERIES = indSeries.vwap;   window.VWAP    = last(indSeries.vwap)  || window.VWAP; }
        if (indSeries.ema9)       { window.EMA9        = indSeries.ema9; }
        if (indSeries.ema21)      { window.EMA21       = indSeries.ema21; }
        if (indSeries.ema50)      { window.EMA50       = indSeries.ema50; }
        if (indSeries.rsi14)      { window.RSI         = indSeries.rsi14; window.RSI_NOW = last(indSeries.rsi14) || window.RSI_NOW; }
        if (indSeries.macd)       { window.MACD_LINE   = indSeries.macd; }
        if (indSeries.macd_signal){ window.MACD_SIGNAL = indSeries.macd_signal; }
        if (indSeries.macd_hist)  { window.MACD_HIST   = indSeries.macd_hist; }
      }

      // ── Dashboard data ────────────────────────────────────────────────
      if (dashboard && !dashboard.detail) {
        // CPR
        if (dashboard.cpr) {
          if (dashboard.cpr.daily)  window.CPR_DAILY  = dashboard.cpr.daily;
          if (dashboard.cpr.weekly) window.CPR_WEEKLY = dashboard.cpr.weekly;
        }

        // Gap / prev close
        if (dashboard.gap && dashboard.gap.prev_close != null) {
          window.PREV_CLOSE = dashboard.gap.prev_close;
          window.GAP_PTS    = dashboard.gap.gap_points;
          window.GAP_PCT    = dashboard.gap.gap_pct;
          if (!candleResp || !candleResp.candles || !candleResp.candles.length) {
            window.TODAY_OPEN = dashboard.gap.today_open || window.TODAY_OPEN;
          }
        }

        // ORB-15
        if (dashboard.orb && dashboard.orb['15m']) {
          const o = dashboard.orb['15m'];
          window.ORB_15 = { high: o.orb_high, low: o.orb_low, status: o.status };
        }

        // Signals → convert to frontend format
        if (dashboard.signals && dashboard.signals.length > 0) {
          window.SIGNALS = dashboard.signals.map(s => {
            const ts = new Date(s.time * 1000);
            return {
              t: `${String(ts.getHours()).padStart(2,'0')}:${String(ts.getMinutes()).padStart(2,'0')}`,
              type: s.type, dir: s.direction, conf: s.confidence, px: s.price, desc: s.description,
            };
          });
        }

        // Bias
        if (dashboard.bias) {
          window.BIAS_LABEL = dashboard.bias.bias || window.BIAS_LABEL;
          // Map score (-10..+10) to gauge value (0..10)
          window.BIAS_SCORE = Math.min(10, Math.abs(dashboard.bias.score) * 1.5) || window.BIAS_SCORE;
        }

        // Global markets → convert dict to array
        if (dashboard.global_markets && typeof dashboard.global_markets === 'object') {
          const gm = Object.entries(dashboard.global_markets)
            .filter(([k, v]) => k !== 'insights' && k !== 'last_updated' && v && typeof v === 'object' && v.price)
            .map(([k, v]) => ({ sym: v.label || k, px: v.price, chg: v.change_pct, time: '—' }));
          if (gm.length > 0) window.GLOBAL_MARKETS = gm;
        }

        // Scalar indicators (current values for readout panel)
        if (dashboard.indicators && dashboard.indicators.price != null) {
          const ind = dashboard.indicators;
          window.LTP     = window.LTP || ind.price;
          window.VWAP    = ind.vwap    || window.VWAP;
          window.RSI_NOW = ind.rsi14   || window.RSI_NOW;
        }

        // Update checklist items from live status
        const authOk = dashboard.session_status !== 'CLOSED';
        window.CHECKLIST = window.CHECKLIST.map(item => {
          if (item.id === 'auth')   return { ...item, done: true, detail: `Session: ${dashboard.session_status}` };
          if (item.id === 'prev')   return { ...item, done: !!(dashboard.gap && dashboard.gap.prev_close), detail: dashboard.gap ? `C ${dashboard.gap.prev_close}` : item.detail };
          if (item.id === 'cpr')    return { ...item, done: !!(dashboard.cpr && dashboard.cpr.daily), detail: dashboard.cpr ? `Width ${(dashboard.cpr.cpr_type || '').toLowerCase()}` : item.detail };
          if (item.id === 'expiry') return { ...item, done: true, detail: dashboard.expiry ? `${dashboard.expiry.days_to_expiry}d to expiry (${dashboard.expiry.expiry_type})` : item.detail };
          return item;
        });
      }

      document.dispatchEvent(new CustomEvent('nifty-data-ready'));
      startWS();

    } catch (err) {
      console.warn('[NiftyBot] Backend unreachable — using mock data:', err.message || err);
    }
  }

  function startWS() {
    if (window._niftyWS && window._niftyWS.readyState <= 1) return;

    let ws;
    try { ws = new WebSocket(`${WS_BASE}/ws/live`); } catch(e) { return; }
    window._niftyWS = ws;

    ws.onmessage = evt => {
      try {
        const msg = JSON.parse(evt.data);

        if (msg.type === 'tick' && msg.data && msg.data.ltp > 0) {
          window.LTP = msg.data.ltp;
          if (msg.data.live_candle) {
            const lc = msg.data.live_candle;
            const tMs = lc.time * 1000;
            const last = window.CANDLES[window.CANDLES.length - 1];
            if (last && last.t === tMs) {
              // Update current open candle in-place
              window.CANDLES[window.CANDLES.length - 1] = {
                ...last, h: Math.max(last.h, lc.high), l: Math.min(last.l, lc.low),
                c: lc.close, v: lc.volume,
              };
            }
            window.LATEST = window.CANDLES[window.CANDLES.length - 1];
          }
          document.dispatchEvent(new CustomEvent('nifty-tick'));

        } else if (msg.type === 'candle_closed' && msg.data) {
          const lc = msg.data;
          const tMs = lc.time * 1000;
          const ts = new Date(tMs);
          const newC = {
            t: tMs,
            tStr: `${String(ts.getHours()).padStart(2,'0')}:${String(ts.getMinutes()).padStart(2,'0')}`,
            o: lc.open, h: lc.high, l: lc.low, c: lc.close, v: lc.volume,
          };
          const idx = window.CANDLES.findIndex(c => c.t === tMs);
          if (idx >= 0) {
            const arr = [...window.CANDLES]; arr[idx] = newC; window.CANDLES = arr;
          } else {
            window.CANDLES = [...window.CANDLES, newC];
          }
          window.LATEST = window.CANDLES[window.CANDLES.length - 1];
          document.dispatchEvent(new CustomEvent('nifty-candle'));
        }
      } catch (e) { /* ignore malformed messages */ }
    };

    ws.onclose = () => { window._niftyWS = null; setTimeout(startWS, 5000); };
    ws.onerror = () => { console.warn('[NiftyBot] WS error'); };
  }

  // Lightweight periodic refresh — indicators + signals only, NOT dashboard
  // Dashboard is skipped here to avoid triggering getCandleData on every poll.
  // The backend scheduler handles full state refresh every 2 min.
  async function refreshIndicators() {
    try {
      const [indSeries, signals] = await Promise.all([
        fetch(`${API_BASE}/api/indicators`).then(r => r.json()).catch(() => null),
        fetch(`${API_BASE}/api/signals/latest`).then(r => r.json()).catch(() => null),
      ]);
      const dashboard = null;  // not fetched in periodic poll

      if (indSeries && !indSeries.error && indSeries.vwap) {
        const last = arr => arr && arr.length ? arr[arr.length - 1] : null;
        if (indSeries.vwap)        { window.VWAP_SERIES = indSeries.vwap;   window.VWAP    = last(indSeries.vwap)  || window.VWAP; }
        if (indSeries.ema9)        { window.EMA9        = indSeries.ema9; }
        if (indSeries.ema21)       { window.EMA21       = indSeries.ema21; }
        if (indSeries.ema50)       { window.EMA50       = indSeries.ema50; }
        if (indSeries.rsi14)       { window.RSI         = indSeries.rsi14; window.RSI_NOW = last(indSeries.rsi14) || window.RSI_NOW; }
        if (indSeries.macd)        { window.MACD_LINE   = indSeries.macd; }
        if (indSeries.macd_signal) { window.MACD_SIGNAL = indSeries.macd_signal; }
        if (indSeries.macd_hist)   { window.MACD_HIST   = indSeries.macd_hist; }
      }

      // Update signals + bias from /api/signals/latest (no historical API call)
      if (signals && signals.signals) {
        if (signals.signals.length > 0) {
          window.SIGNALS = signals.signals.map(s => {
            const ts = new Date(s.time * 1000);
            return { t: `${String(ts.getHours()).padStart(2,'0')}:${String(ts.getMinutes()).padStart(2,'0')}`, type: s.type, dir: s.direction, conf: s.confidence, px: s.price, desc: s.description };
          });
        }
        if (signals.bias) {
          window.BIAS_LABEL = signals.bias.bias || window.BIAS_LABEL;
          window.BIAS_SCORE = Math.min(10, Math.abs(signals.bias.score) * 1.5) || window.BIAS_SCORE;
        }
        if (signals.indicators && signals.indicators.price != null) {
          window.LTP     = signals.indicators.price || window.LTP;
          window.VWAP    = signals.indicators.vwap  || window.VWAP;
          window.RSI_NOW = signals.indicators.rsi14 || window.RSI_NOW;
        }
      }

      document.dispatchEvent(new CustomEvent('nifty-data-ready'));
    } catch (e) { /* silent — keep stale values */ }
  }

  // Auto-start after all scripts load
  window._niftyInitLive = initLiveData;
  window._niftyRefreshIndicators = refreshIndicators;

  // Fetch news + polymarket and expose live arrays
  async function refreshAux() {
    try {
      const [news, poly] = await Promise.all([
        fetch(`${API_BASE}/api/news`).then(r => r.json()).catch(() => null),
        fetch(`${API_BASE}/api/polymarket`).then(r => r.json()).catch(() => null),
      ]);

      // ── News ─────────────────────────────────────────────
      // Backend may return either an array of items or { items: [...] }
      const newsItems = Array.isArray(news) ? news
        : (news && Array.isArray(news.items)) ? news.items
        : (news && Array.isArray(news.headlines)) ? news.headlines
        : (news && Array.isArray(news.news)) ? news.news
        : null;

      if (newsItems && newsItems.length) {
        const fmtAge = (ts) => {
          if (!ts) return '—';
          const d = (typeof ts === 'number') ? new Date(ts * (ts < 1e12 ? 1000 : 1)) : new Date(ts);
          if (isNaN(d.getTime())) return String(ts);
          const diffM = Math.max(0, Math.round((Date.now() - d.getTime()) / 60000));
          if (diffM < 60) return `${diffM}m`;
          const h = Math.floor(diffM / 60); if (h < 24) return `${h}h`;
          return `${Math.floor(h/24)}d`;
        };
        const inferImpact = (txt) => {
          const s = String(txt || '').toLowerCase();
          const bull = ['rally','beat','surge','rise','gain','growth','buy','positive','upgrade','outperform','bullish'];
          const bear = ['fall','drop','plunge','miss','cut','downgrade','negative','sell','bearish','warning'];
          if (bull.some(w => s.includes(w))) return 'bullish';
          if (bear.some(w => s.includes(w))) return 'bearish';
          return 'neutral';
        };
        window.NEWS_LIVE = newsItems.map(n => ({
          src: n.source || n.src || n.publisher || 'News',
          t:   n.t || n.age || fmtAge(n.published_at || n.timestamp || n.time || n.date),
          headline: n.title || n.headline || n.text || '',
          summary: n.summary || n.description || '',
          impact:  n.impact || n.sentiment || inferImpact(n.title || n.headline || ''),
          url:     n.url || n.link || '',
        }));
      }

      // ── Polymarket ───────────────────────────────────────
      const polyItems = Array.isArray(poly) ? poly
        : (poly && Array.isArray(poly.markets)) ? poly.markets
        : (poly && Array.isArray(poly.items)) ? poly.items
        : null;
      if (polyItems && polyItems.length) {
        const toCents = (v) => {
          if (v == null) return 50;
          const n = (typeof v === 'string') ? parseFloat(v) : Number(v);
          if (isNaN(n)) return 50;
          return n <= 1 ? Math.round(n * 100) : Math.round(n);
        };
        const fmtVol = (v) => {
          if (v == null) return '—';
          if (typeof v === 'string' && v.startsWith('$')) return v;
          const n = Number(v); if (isNaN(n)) return String(v);
          if (n >= 1e6) return `$${(n/1e6).toFixed(1)}M`;
          if (n >= 1e3) return `$${(n/1e3).toFixed(0)}k`;
          return `$${n.toFixed(0)}`;
        };
        window.POLY_LIVE = polyItems.map(p => ({
          q:   p.question || p.q || p.title || '',
          // Backend returns yes_pct (e.g. 16.4) — must check it first
          yes: toCents(p.yes_pct ?? p.yes_price ?? p.yes ?? p.probability ?? p.prob),
          // Prefer 24h volume for relevance
          vol: p.vol || p.volume_str || fmtVol(p.volume_24h ?? p.volume),
          url: p.url || (p.slug ? `https://polymarket.com/event/${p.slug}` : ''),
          cat: p.category || '',
        }));
      }

      document.dispatchEvent(new CustomEvent('nifty-news-ready'));
      document.dispatchEvent(new CustomEvent('nifty-poly-ready'));
    } catch (e) { /* silent */ }
  }
  window._niftyRefreshAux = refreshAux;

  function autoStart() {
    setTimeout(initLiveData, 200);
    setTimeout(refreshAux, 400);
    // 10s cadence — lightweight indicator + dashboard refresh, news, polymarket
    setInterval(refreshIndicators, 10 * 1000);
    setInterval(refreshAux, 10 * 1000);
  }

  if (document.readyState === 'complete') {
    autoStart();
  } else {
    window.addEventListener('load', autoStart);
  }
})();
