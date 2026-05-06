import { create } from 'zustand'
import axios from 'axios'

const API = axios.create({ baseURL: '/api', timeout: 15000 })

export const useStore = create((set, get) => ({
  // ── Connection state ────────────────────────────────────────────────
  wsConnected: false,
  wsStatus: 'disconnected',
  lastTick: null,

  // ── Market state ────────────────────────────────────────────────────
  sessionStatus: 'LOADING',
  marketOpen: false,
  timeIST: null,
  expiry: null,
  staticIpWarning: false,

  // ── Price / candles ─────────────────────────────────────────────────
  ltp: null,
  ltpChange: null,
  candles: [],
  liveCandle: null,
  interval: '1m',

  // ── CPR ─────────────────────────────────────────────────────────────
  cpr: null,

  // ── Gap ─────────────────────────────────────────────────────────────
  gap: null,
  orb: null,

  // ── Indicators ──────────────────────────────────────────────────────
  indicators: null,

  // ── Signals ─────────────────────────────────────────────────────────
  signals: [],
  bias: null,

  // ── Global markets ───────────────────────────────────────────────────
  globalMarkets: null,

  // ── Volume ──────────────────────────────────────────────────────────
  vwapSeries: [],
  volumeProfile: [],
  volumeAnalysis: null,

  // ── News ────────────────────────────────────────────────────────────
  news: null,

  // ── Polymarket ───────────────────────────────────────────────────────
  polymarket: null,

  // ── Auth ────────────────────────────────────────────────────────────
  authStatus: null,

  // ── Actions ─────────────────────────────────────────────────────────

  fetchDashboard: async () => {
    try {
      const { data } = await API.get('/dashboard')
      set({
        sessionStatus: data.session_status,
        marketOpen: data.market_open,
        timeIST: data.time_ist,
        expiry: data.expiry,
        cpr: data.cpr,
        gap: data.gap,
        orb: data.orb,
        indicators: data.indicators,
        signals: data.signals || [],
        bias: data.bias,
        globalMarkets: data.global_markets,
        staticIpWarning: data.static_ip_warning,
      })
      if (data.indicators?.price) {
        set({ ltp: data.indicators.price })
      }
    } catch (e) {
      console.error('fetchDashboard error:', e)
    }
  },

  fetchCandles: async (interval = '1m') => {
    try {
      const { data } = await API.get('/market/nifty/today', { params: { interval } })
      const { candles, live_candle } = data

      const prev = get().ltp
      const newLtp = live_candle?.close || (candles.length ? candles[candles.length - 1]?.close : null)
      const change = prev && newLtp ? newLtp - prev : null

      set({
        candles: candles || [],
        liveCandle: live_candle,
        ltp: newLtp,
        ltpChange: change,
        interval,
      })
    } catch (e) {
      console.error('fetchCandles error:', e)
    }
  },

  fetchCPR: async () => {
    try {
      const { data } = await API.get('/cpr/today')
      set({ cpr: data })
    } catch (e) {
      console.error('fetchCPR error:', e)
    }
  },

  fetchSignals: async () => {
    try {
      const { data } = await API.get('/signals/latest')
      set({
        signals: data.signals || [],
        bias: data.bias,
        indicators: data.indicators,
        volumeAnalysis: data.volume,
      })
    } catch (e) {
      console.error('fetchSignals error:', e)
    }
  },

  fetchGlobalMarkets: async () => {
    try {
      const { data } = await API.get('/global')
      set({ globalMarkets: data })
    } catch (e) {
      console.error('fetchGlobalMarkets error:', e)
    }
  },

  fetchVWAP: async () => {
    try {
      const { data } = await API.get('/volume/vwap')
      set({
        vwapSeries: data.vwap_series || [],
        volumeProfile: data.volume_profile || [],
        volumeAnalysis: data.volume_analysis,
      })
    } catch (e) {
      console.error('fetchVWAP error:', e)
    }
  },

  fetchNews: async () => {
    try {
      const { data } = await API.get('/news')
      set({ news: data })
    } catch (e) {
      console.error('fetchNews error:', e)
    }
  },

  fetchPolymarket: async () => {
    try {
      const { data } = await API.get('/polymarket')
      set({ polymarket: data })
    } catch (e) {
      console.error('fetchPolymarket error:', e)
    }
  },

  fetchAuthStatus: async () => {
    try {
      const { data } = await API.get('/auth/status')
      set({ authStatus: data })
    } catch (e) {
      console.error('fetchAuthStatus error:', e)
    }
  },

  // WebSocket live tick handler
  handleWsTick: (msg) => {
    if (msg.type === 'tick') {
      const { ltp, live_candle } = msg.data
      const prev = get().ltp
      set({
        ltp: ltp || get().ltp,
        ltpChange: prev && ltp ? ltp - prev : null,
        liveCandle: live_candle || get().liveCandle,
        lastTick: Date.now(),
      })
    } else if (msg.type === 'candle_closed') {
      const newCandle = msg.data
      const candles = get().candles
      // Avoid duplicates
      const exists = candles.some(c => c.time === newCandle.time)
      if (!exists) {
        set({ candles: [...candles, newCandle] })
      }
    } else if (msg.type === 'heartbeat') {
      set({ sessionStatus: msg.session || get().sessionStatus })
    }
  },

  setWsConnected: (v) => set({ wsConnected: v, wsStatus: v ? 'connected' : 'disconnected' }),
}))
