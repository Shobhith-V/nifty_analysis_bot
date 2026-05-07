// Reusable atoms
const fmt = (n, d = 2) => {
  if (n == null || isNaN(n)) return "—";
  return Number(n).toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d });
};
const fmtPct = (n, d = 2) => (n >= 0 ? "+" : "") + Number(n).toFixed(d) + "%";
const fmtPts = (n, d = 2) => (n >= 0 ? "+" : "") + Number(n).toFixed(d);

function Spark({ data, w = 80, h = 22, color = "var(--cyan)", fill = false }) {
  if (!data || data.length === 0) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / span) * h;
    return [x, y];
  });
  const d = pts.map((p, i) => (i === 0 ? "M" : "L") + p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ");
  const dFill = d + ` L${w},${h} L0,${h} Z`;
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      {fill && <path d={dFill} fill={color} opacity="0.15" />}
      <path d={d} fill="none" stroke={color} strokeWidth="1.2" />
    </svg>
  );
}

function Chip({ children, tone = "default" }) {
  return <span className={"chip " + (tone !== "default" ? tone : "")}>{children}</span>;
}

function ChangeText({ pts, pct, abs = false }) {
  const positive = pts >= 0;
  return (
    <span className={"mono " + (positive ? "up" : "down")}>
      {abs ? Math.abs(pts).toFixed(2) : fmtPts(pts)}
      {pct != null && <span style={{ opacity: 0.75, marginLeft: 6 }}>({fmtPct(pct)})</span>}
    </span>
  );
}

// Simple ring/arc gauge for the bias dial
function Gauge({ value = 0, max = 10, label = "BIAS", sublabel = "BULLISH", color = "var(--green)" }) {
  const pct = Math.min(1, Math.abs(value) / max);
  const r = 56;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - pct);
  return (
    <div style={{ position: "relative", width: 140, height: 140 }}>
      <svg width="140" height="140" viewBox="0 0 140 140">
        <defs>
          <linearGradient id="gaugeGrad" x1="0" x2="1">
            <stop offset="0" stopColor={color} stopOpacity="0.4" />
            <stop offset="1" stopColor={color} stopOpacity="1" />
          </linearGradient>
        </defs>
        <circle cx="70" cy="70" r={r} stroke="var(--hairline)" strokeWidth="6" fill="none" />
        <circle
          cx="70" cy="70" r={r}
          stroke="url(#gaugeGrad)"
          strokeWidth="6"
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 70 70)"
        />
        {/* tick marks */}
        {Array.from({ length: 24 }).map((_, i) => {
          const a = (i / 24) * Math.PI * 2 - Math.PI / 2;
          const x1 = 70 + Math.cos(a) * (r + 8);
          const y1 = 70 + Math.sin(a) * (r + 8);
          const x2 = 70 + Math.cos(a) * (r + 12);
          const y2 = 70 + Math.sin(a) * (r + 12);
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--hairline)" strokeWidth="1" />;
        })}
      </svg>
      <div style={{
        position: "absolute", inset: 0, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: 2
      }}>
        <div className="mono" style={{ fontSize: 9, letterSpacing: '0.15em', color: "var(--dim)" }}>{label}</div>
        <div className="mono" style={{ fontSize: 28, fontWeight: 600, color: color, lineHeight: 1 }}>{value.toFixed(1)}</div>
        <div className="mono" style={{ fontSize: 9, letterSpacing: '0.15em', color: color }}>{sublabel}</div>
      </div>
    </div>
  );
}

Object.assign(window, { fmt, fmtPct, fmtPts, Spark, Chip, ChangeText, Gauge });
