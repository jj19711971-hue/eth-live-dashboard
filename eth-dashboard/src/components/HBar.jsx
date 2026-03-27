export default function HBar({ value, max = 100, color }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100))
  return (
    <div style={{ flex: 1, height: 8, background: '#e8e5de', borderRadius: 4, overflow: 'hidden', marginRight: 8 }}>
      <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 4, transition: 'width 0.8s ease' }} />
    </div>
  )
}
