import { useState } from 'react'
import { useStore } from '../store/useStore'
import axios from 'axios'

export default function SettingsPanel({ onClose }) {
  const authStatus = useStore(s => s.authStatus)
  const fetchAuthStatus = useStore(s => s.fetchAuthStatus)
  const [loginLoading, setLoginLoading] = useState(false)
  const [loginMsg, setLoginMsg] = useState('')

  const handleLogin = async () => {
    setLoginLoading(true)
    setLoginMsg('')
    try {
      await axios.post('/api/auth/login')
      setLoginMsg('Authentication successful')
      await fetchAuthStatus()
    } catch (e) {
      setLoginMsg(`Error: ${e.response?.data?.detail || e.message}`)
    } finally {
      setLoginLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center">
      <div className="bg-terminal-card border border-terminal-border rounded-xl w-full max-w-md p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-terminal-text font-sans font-bold text-lg">Settings</h2>
          <button
            onClick={onClose}
            className="text-terminal-text-dim hover:text-terminal-text transition-colors text-xl"
          >
            ×
          </button>
        </div>

        {/* Auth section */}
        <div className="mb-5">
          <h3 className="text-terminal-text-dim font-sans text-xs uppercase tracking-wide mb-3">
            Angel One Authentication
          </h3>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-terminal-text-dim">Status</span>
              <span className={`font-mono font-semibold ${authStatus?.authenticated ? 'text-terminal-green' : 'text-terminal-red'}`}>
                {authStatus?.authenticated ? 'AUTHENTICATED' : 'NOT AUTHENTICATED'}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-terminal-text-dim">Static IP</span>
              <span className={`font-mono text-xs ${authStatus?.static_ip_registered ? 'text-terminal-green' : 'text-terminal-yellow'}`}>
                {authStatus?.static_ip_registered ? 'REGISTERED' : 'NOT REGISTERED'}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-terminal-text-dim">OAuth Mode</span>
              <span className="font-mono text-xs text-terminal-text-dim">
                {authStatus?.use_oauth === 'true' ? 'ENABLED' : 'DISABLED (TOTP)'}
              </span>
            </div>
          </div>
          <button
            onClick={handleLogin}
            disabled={loginLoading}
            className="mt-3 w-full bg-terminal-accent hover:bg-terminal-accent-light disabled:opacity-50 text-white font-mono text-sm py-2 rounded transition-colors"
          >
            {loginLoading ? 'Authenticating...' : 'Re-authenticate'}
          </button>
          {loginMsg && (
            <div className={`mt-2 text-xs font-mono ${loginMsg.includes('Error') ? 'text-terminal-red' : 'text-terminal-green'}`}>
              {loginMsg}
            </div>
          )}
        </div>

        {/* Mode */}
        <div className="mb-5">
          <h3 className="text-terminal-text-dim font-sans text-xs uppercase tracking-wide mb-3">
            Trading Mode
          </h3>
          <div className="bg-terminal-bg/50 rounded p-3 border border-terminal-green/30">
            <div className="text-terminal-green font-mono text-sm font-bold">ANALYSIS ONLY</div>
            <div className="text-terminal-text-dim text-xs font-sans mt-1">
              This bot does not place any orders. All signals are for analysis purposes only.
            </div>
          </div>
        </div>

        {/* Warnings */}
        {authStatus?.static_ip_warning && (
          <div className="bg-terminal-yellow/10 border border-terminal-yellow/30 rounded p-3">
            <div className="text-terminal-yellow font-mono text-xs font-bold mb-1">
              ⚠ Static IP Warning
            </div>
            <div className="text-terminal-text-dim text-xs font-sans">
              From August 2025, Angel One requires a static IP for order APIs.
              Set STATIC_IP_REGISTERED=true in .env after registering your IP.
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
