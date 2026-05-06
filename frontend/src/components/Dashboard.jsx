import { useEffect, useState } from 'react'
import { useStore } from '../store/useStore'
import { useWebSocket } from '../hooks/useWebSocket'
import SessionTimer from './SessionTimer'
import TodaySetupCard from './TodaySetupCard'
import CPRPanel from './CPRPanel'
import GapAnalysisCard from './GapAnalysisCard'
import CandlestickChart from './CandlestickChart'
import SignalsPanel from './SignalsPanel'
import GlobalMarketsPanel from './GlobalMarketsPanel'
import VolumeAnalysis from './VolumeAnalysis'
import NewsPanel from './NewsPanel'
import PolymarketPanel from './PolymarketPanel'
import SettingsPanel from './SettingsPanel'

const REFRESH_INTERVAL = 30000  // 30s

export default function Dashboard() {
  const [showSettings, setShowSettings] = useState(false)
  const [bottomOpen, setBottomOpen] = useState(true)
  const [activeBottom, setActiveBottom] = useState('polymarket')

  const {
    fetchDashboard, fetchCandles, fetchSignals,
    fetchGlobalMarkets, fetchVWAP, fetchNews,
    fetchPolymarket, fetchAuthStatus,
    sessionStatus, staticIpWarning, wsConnected,
    marketOpen,
  } = useStore()

  useWebSocket()

  // Initial load
  useEffect(() => {
    const init = async () => {
      await fetchDashboard()
      await Promise.all([
        fetchCandles('1m'),
        fetchVWAP(),
        fetchNews(),
        fetchPolymarket(),
        fetchAuthStatus(),
      ])
    }
    init()
  }, [])

  // Periodic refresh
  useEffect(() => {
    const id = setInterval(async () => {
      await fetchDashboard()
      await Promise.all([
        fetchCandles(useStore.getState().interval),
        fetchSignals(),
        fetchVWAP(),
      ])
      if (!wsConnected) {
        await fetchGlobalMarkets()
      }
    }, REFRESH_INTERVAL)
    return () => clearInterval(id)
  }, [wsConnected])

  return (
    <div className="flex flex-col h-screen bg-terminal-bg overflow-hidden">
      {/* Top bar */}
      <header className="shrink-0 border-b border-terminal-border bg-terminal-card px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-terminal-accent" />
          <span className="font-mono text-sm font-bold text-terminal-text">NIFTY 50 ANALYSIS BOT</span>
          <span className="text-terminal-text-dim font-mono text-xs px-2 py-0.5 bg-terminal-border rounded">
            {sessionStatus}
          </span>
        </div>

        <div className="flex items-center gap-3">
          {staticIpWarning && (
            <div className="text-xs font-mono text-terminal-yellow bg-terminal-yellow/10 border border-terminal-yellow/30 px-3 py-1 rounded">
              ⚠ Static IP not registered (Aug 2025 required)
            </div>
          )}
          <div className="text-xs font-mono text-terminal-green bg-terminal-green/10 border border-terminal-green/20 px-3 py-1 rounded">
            ANALYSIS ONLY — No Orders
          </div>
          <button
            onClick={() => setShowSettings(true)}
            className="text-terminal-text-dim hover:text-terminal-text transition-colors px-2 py-1 rounded border border-terminal-border hover:border-terminal-accent text-xs font-mono"
          >
            ⚙ Settings
          </button>
        </div>
      </header>

      {/* Main 3-column layout */}
      <div className="flex flex-1 min-h-0 gap-2 p-2">
        {/* LEFT COLUMN (30%) */}
        <div className="w-[30%] shrink-0 flex flex-col gap-2 overflow-y-auto">
          <SessionTimer />
          <TodaySetupCard />
          <CPRPanel />
          <GapAnalysisCard />
        </div>

        {/* CENTER COLUMN (45%) */}
        <div className="flex-1 flex flex-col gap-2 min-w-0">
          <div className="flex-1 min-h-0">
            <CandlestickChart />
          </div>
        </div>

        {/* RIGHT COLUMN (25%) */}
        <div className="w-[25%] shrink-0 flex flex-col gap-2 overflow-y-auto">
          <GlobalMarketsPanel />
          <SignalsPanel />
          <VolumeAnalysis />
          <NewsPanel />
        </div>
      </div>

      {/* Bottom collapsible panel */}
      <div className="shrink-0 border-t border-terminal-border">
        <button
          onClick={() => setBottomOpen(v => !v)}
          className="w-full flex items-center justify-between px-4 py-2 text-xs font-mono text-terminal-text-dim hover:text-terminal-text bg-terminal-card transition-colors"
        >
          <div className="flex items-center gap-3">
            <span>{bottomOpen ? '▼' : '▲'}</span>
            <span>BOTTOM PANEL</span>
            <div className="flex gap-2">
              {['polymarket', 'news-full'].map(tab => (
                <button
                  key={tab}
                  onClick={(e) => { e.stopPropagation(); setActiveBottom(tab); setBottomOpen(true) }}
                  className={`px-2 py-0.5 rounded ${activeBottom === tab ? 'bg-terminal-accent text-white' : 'bg-terminal-border text-terminal-text-dim'}`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>
        </button>
        {bottomOpen && (
          <div className="bg-terminal-bg p-2 max-h-64 overflow-y-auto">
            <div className="grid grid-cols-2 gap-2">
              {activeBottom === 'polymarket' && (
                <div className="col-span-2"><PolymarketPanel /></div>
              )}
              {activeBottom === 'news-full' && (
                <div className="col-span-2"><NewsPanel /></div>
              )}
            </div>
          </div>
        )}
      </div>

      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
    </div>
  )
}
