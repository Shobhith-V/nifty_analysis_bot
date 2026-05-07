function BottomStrip() {
  const [tab, setTab] = React.useState('ai');
  const [chatLog, setChatLog] = React.useState(AI_LOG);
  const [chatInput, setChatInput] = React.useState('');
  const [chatLoading, setChatLoading] = React.useState(false);
  const [chatModel, setChatModel] = React.useState('');
  // Conversation history for multi-turn (OpenAI format)
  const chatHistory = React.useRef([]);

  const API_BASE = (window.location.port === '8000' || window.location.port === '') ? '' : 'http://localhost:8000';

  const ts = () => { const d = new Date(); return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`; };

  const askBot = async () => {
    const q = chatInput.trim();
    if (!q || chatLoading) return;
    setChatInput('');
    setChatLoading(true);

    const t = ts();
    setChatLog(prev => [{ t, msg: q, isUser: true }, ...prev]);
    chatHistory.current.push({ role: 'user', content: q });

    try {
      const res = await fetch(`${API_BASE}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, history: chatHistory.current.slice(-10) }),
      }).then(r => r.json());

      const answer = res.answer || 'No response.';
      chatHistory.current.push({ role: 'assistant', content: answer });
      setChatModel(res.model || '');
      setChatLog(prev => [{ t: ts(), msg: answer, isBot: true }, ...prev]);
    } catch (e) {
      setChatLog(prev => [{ t, msg: '⚠ Chat unavailable — is the backend running?', isErr: true }, ...prev]);
    }
    setChatLoading(false);
  };

  const clearChat = () => { chatHistory.current = []; setChatLog(AI_LOG); };
  const onKey = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); askBot(); } };

  return (
    <div style={{
      flexShrink: 0, height: 200, borderTop: '1px solid var(--hairline)',
      display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 0,
      background: 'var(--bg)',
      minHeight: 0
    }}>
      {/* AI Commentary / Chat */}
      <div className="panel-flush" style={{ borderRight: '1px solid var(--hairline)', display: 'flex', flexDirection: 'column' }}>
        <div className="panel-h">
          <div className="lhs">
            <span className="num">α</span><span>AI Chat</span>
            {chatModel && <Chip tone="cyan">{chatModel}</Chip>}
          </div>
          <div className="rhs">
            {chatLoading
              ? <span className="mono" style={{ fontSize: 9, color: 'var(--cyan)' }}>⟳ thinking…</span>
              : <><span><span className="dot" />LIVE</span>
                 <button className="btn sm" style={{ padding: '0 6px', fontSize: 9 }} onClick={clearChat}>clear</button></>}
          </div>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: '6px 10px' }}>
          {chatLog.map((l, i) => {
            const col = l.isUser ? 'var(--amber)' : l.isErr ? 'var(--red)' : (i === 0 ? 'var(--fg)' : 'var(--fg-2)');
            return (
              <div key={i} style={{ display: 'flex', gap: 8, padding: '4px 0', borderBottom: '1px solid var(--hairline-soft)' }}>
                <span className="mono" style={{ fontSize: 9, color: 'var(--dim-2)', minWidth: 60 }}>{l.t}</span>
                <span className="mono" style={{ fontSize: 11, color: col, lineHeight: 1.4 }}>
                  {i === 0 && !l.isUser && <span style={{ color: 'var(--cyan)' }}>▸ </span>}{l.msg}
                </span>
              </div>
            );
          })}
        </div>
        <div style={{ padding: 8, borderTop: '1px solid var(--hairline)', display: 'flex', gap: 6 }}>
          <input
            value={chatInput}
            onChange={e => setChatInput(e.target.value)}
            onKeyDown={onKey}
            placeholder="Ask… 'why is RSI dropping?' · 'is CPR bullish?'"
            style={{
              flex: 1, height: 28, background: 'var(--bg-2)', border: '1px solid var(--hairline)',
              borderRadius: 3, padding: '0 8px', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--fg)'
            }}
          />
          <button className="btn primary sm" onClick={askBot} disabled={chatLoading}>↵ Ask</button>
        </div>
      </div>

      {/* News + Polymarket preview (full pages live in top-level tabs) */}
      <div className="panel-flush" style={{ borderRight: '1px solid var(--hairline)', display: 'flex', flexDirection: 'column' }}>
        <div className="panel-h">
          <div className="lhs">
            <button className={"tab " + (tab === 'ai' ? "active" : "")} style={{ height: 24, padding: '0 6px', fontSize: 9 }} onClick={() => setTab('ai')}>News</button>
            <button className={"tab " + (tab === 'p' ? "active" : "")} style={{ height: 24, padding: '0 6px', fontSize: 9 }} onClick={() => setTab('p')}>Polymarket</button>
            <button className={"tab " + (tab === 'cal' ? "active" : "")} style={{ height: 24, padding: '0 6px', fontSize: 9 }} onClick={() => setTab('cal')}>Events</button>
          </div>
          <div className="rhs">
            <span>auto · 10s</span>
          </div>
        </div>
        <div style={{ flex: 1, overflow: 'auto' }}>
          {tab !== 'p' && tab !== 'cal' && (window.NEWS_LIVE && window.NEWS_LIVE.length ? window.NEWS_LIVE : NEWS).slice(0, 8).map((n, i) => {
            const col = n.impact === 'bullish' ? 'var(--green)' : n.impact === 'bearish' ? 'var(--red)' : 'var(--dim)';
            return (
              <div key={i} style={{ padding: '8px 10px', borderBottom: '1px solid var(--hairline-soft)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                  <span style={{ width: 4, height: 4, borderRadius: 0.5, background: col }} />
                  <span className="mono" style={{ fontSize: 9, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{n.src}</span>
                  <span className="mono" style={{ fontSize: 9, color: 'var(--dim-2)', marginLeft: 'auto' }}>{n.t}</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--fg-2)', lineHeight: 1.4 }}>{n.headline}</div>
              </div>
            );
          })}
          {tab === 'p' && (window.POLY_LIVE && window.POLY_LIVE.length ? window.POLY_LIVE : POLY).map((p, i) => (
            <div key={i} style={{ padding: '10px', borderBottom: '1px solid var(--hairline-soft)' }}>
              <div style={{ fontSize: 11, color: 'var(--fg-2)', marginBottom: 6, lineHeight: 1.4 }}>{p.q}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ flex: 1, position: 'relative', height: 18, background: 'var(--bg-2)', border: '1px solid var(--hairline-soft)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', inset: 0, width: `${p.yes}%`, background: 'oklch(0.74 0.16 145 / 0.25)' }} />
                  <div className="mono" style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 6px', fontSize: 10 }}>
                    <span style={{ color: 'var(--green)' }}>YES {p.yes}¢</span>
                    <span style={{ color: 'var(--red)' }}>NO {100-p.yes}¢</span>
                  </div>
                </div>
                <span className="mono" style={{ fontSize: 9, color: 'var(--dim)' }}>{p.vol}</span>
              </div>
            </div>
          ))}
          {tab === 'cal' && (
            <div style={{ padding: 10 }}>
              {[
                ['Today 15:30', 'Weekly F&O Expiry', 'amber'],
                ['Tomorrow', 'CPI Inflation Data', 'amber'],
                ['Fri 18:00', 'Fed Minutes (US)', 'cyan'],
                ['Mon', 'Q2 GDP Release', 'cyan'],
              ].map(([t, ev, c], i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--hairline-soft)' }}>
                  <span className="mono" style={{ fontSize: 10, color: 'var(--dim)' }}>{t}</span>
                  <span style={{ fontSize: 11, color: 'var(--fg-2)' }}>{ev}</span>
                  <Chip tone={c}>{c === 'amber' ? 'HIGH' : 'MED'}</Chip>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Global Markets grid */}
      <div className="panel-flush" style={{ display: 'flex', flexDirection: 'column' }}>
        <div className="panel-h">
          <div className="lhs"><span className="num">μ</span><span>Global Markets</span></div>
          <div className="rhs"><span>auto · 30s</span></div>
        </div>
        <div style={{ flex: 1, overflow: 'auto' }}>
          <table className="tbl" style={{ width: '100%' }}>
            <thead>
              <tr><th>SYMBOL</th><th className="right">PRICE</th><th className="right">CHG%</th><th className="right">STATUS</th></tr>
            </thead>
            <tbody>
              {GLOBAL_MARKETS.map((m, i) => (
                <tr key={i}>
                  <td><span style={{ color: 'var(--fg)' }}>{m.sym}</span></td>
                  <td className="right">{fmt(m.px)}</td>
                  <td className={"right " + (m.chg >= 0 ? 'up' : 'down')}>{fmtPct(m.chg)}</td>
                  <td className="right" style={{ color: 'var(--dim)', fontSize: 9 }}>{m.time}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

window.BottomStrip = BottomStrip;
