export default function GaugeRing({ score }) {
  const r = 38, cx = 46, cy = 46
  const circ = 2 * Math.PI * r
  const color = score >= 65 ? '#52b788' : score >= 45 ? '#f4a261' : '#e63946'
  return (
    <div style={{ position: 'relative', width: 92, height: 92 }}>
      <svg width={92} height={92} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e0ddd5" strokeWidth="7" />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth="7"
          strokeDasharray={`${(score / 100) * circ} ${circ}`} strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 1s ease' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: 9, color: '#999', letterSpacing: 0.3, lineHeight: 1 }}>Forecast Score</span>
        <span style={{ fontSize: 20, fontWeight: 700, color: color, lineHeight: 1.1, marginTop: 2 }}>
          {score}<span style={{ fontSize: 11, color: '#aaa', fontWeight: 400 }}>/100</span>
        </span>
      </div>
    </div>
  )
}
