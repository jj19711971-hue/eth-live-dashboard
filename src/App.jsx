import { useState, useEffect, useCallback, useRef } from 'react'
import GaugeRing from './components/GaugeRing.jsx'
import HBar from './components/HBar.jsx'
import { fetchMarketData, fetchNewsAnalysis } from './logic/api.js'
import {
  calcEMA, calcRSI, calcATR, calcADX,
  findSwings, calcVolumeTrend,
  calcForecastScore, calcScoreBreakdown,
  getSignal, fgLabel, fgColor
} from './logic/logic.js'

const AUTO_REFRESH_SEC = 30

function Card({ children, style = {} }) {
  return (
    <div style={{
      background: '#ffffff', borderRadius: 14,
      margin: '8px 16px', padding: '14px 18px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
      border: '1px solid #ede9e0', ...style
    }}>{children}</div>
  )
}

function SecTitle({ children }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 700, color: '#a09880', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 10 }}>
      {children}
    </div>
  )
}

function IndRow({ dotColor, label, value, valueColor, bar, last }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '8px 0', borderBottom: last ? 'none' : '1px solid #f2ede4'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 110 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor, flexShrink: 0, display: 'inline-block' }} />
        <span style={{ fontSize: 13, color: '#5a5248', fontWeight: 500 }}>{label}</span>
      </div>
      {bar
        ? <div style={{ display: 'flex', alignItems: 'center', flex: 1, marginLeft: 12 }}>
            <HBar value={bar.value} max={bar.max} color={bar.color} />
            <span style={{ fontSize: 13, fontWeight: 700, color: valueColor, minWidth: 40, textAlign: 'right' }}>{value}</span>
          </div>
        : <span style={{ fontSize: 13, fontWeight: 700, color: valueColor }}>{value}</span>
      }
    </div>
  )
}

function Tag({ label }) {
  const bull = label === 'บวก'
  return (
    <span style={{
      fontSize: 10, padding: '2px 9px', borderRadius: 10, flexShrink: 0,
      background: bull ? '#e6f4ea' : '#fff3e0',
      color: bull ? '#2d6a4f' : '#c0621a', fontWeight: 600, marginLeft: 6
    }}>{label}</span>
  )
}

function Countdown({ sec, total }) {
  const r = 10, circ = 2 * Math.PI * r
  return (
    <div style={{ position: 'relative', width: 26, height: 26 }}>
      <svg width={26} height={26} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={13} cy={13} r={r} fill="none" stroke="#e8e5de" strokeWidth="2.5" />
        <circle cx={13} cy={13} r={r} fill="none" stroke="#52b788" strokeWidth="2.5"
          strokeDasharray={`${(sec / total) * circ} ${circ}`} strokeLinecap="round" />
      </svg>
      <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 700, color: '#52b788' }}>{sec}</span>
    </div>
  )
}

export default function App() {
  const [loading, setLoading]           = useState(true)
  const [refreshing, setRefreshing]     = useState(false)
  const [error, setError]               = useState(null)
  const [ind, setInd]                   = useState(null)
  const [score, setScore]               = useState(null)
  const [breakdown, setBreakdown]       = useState(null)
  const [news, setNews]                 = useState(null)
  const [newsLoading, setNewsLoading]   = useState(false)
  const [lastUpdate, setLastUpdate]     = useState(null)
  const [countdown, setCountdown]       = useState(AUTO_REFRESH_SEC)
  const timerRef = useRef(null)
  const countRef = useRef(null)

  const load = useCallback(async (isRefresh = false) => {
    isRefresh ? setRefreshing(true) : setLoading(true)
    setError(null)
    try {
      const { h1, h4, btcCloses, fg, btcDom, ethThb, fundingLabel, fundingColor } = await fetchMarketData()
      const closes = h1.map(k => k.c), highs = h1.map(k => k.h), lows = h1.map(k => k.l), vols = h1.map(k => k.v)
      const h4c = h4.map(k => k.c)
      const price = closes[closes.length - 1]
      const price24hAgo = closes[closes.length - 25] ?? closes[0]
      const pctChange = ((price - price24hAgo) / price24hAgo) * 100
      const ema9 = calcEMA(closes.slice(-60), 9), ema21 = calcEMA(closes.slice(-60), 21), ema55 = calcEMA(closes.slice(-60), 55)
      const ema21h4 = calcEMA(h4c, 21), rsi = calcRSI(closes.slice(-30), 14)
      const atr = calcATR(highs.slice(-30), lows.slice(-30), closes.slice(-30), 14)
      const { adx, plusDI, minusDI } = calcADX(highs.slice(-60), lows.slice(-60), closes.slice(-60), 14)
      const { support, resistance } = findSwings(highs, lows, 100, 3)
      const { ratio: volRatio, pct: volPct } = calcVolumeTrend(vols)
      const btcChg = btcCloses.length >= 25 ? ((btcCloses[btcCloses.length - 1] - btcCloses[btcCloses.length - 25]) / btcCloses[btcCloses.length - 25]) * 100 : 0

      const indicators = { price, pctChange, ema9, ema21, ema55, ema21h4, rsi, atr, adx, plusDI, minusDI, volRatio, volPct, fg, btcChg, btcDom, support, resistance, ethThb, fundingLabel, fundingColor }
      setInd(indicators)
      const s = calcForecastScore(indicators)
      setScore(s)
      setBreakdown(calcScoreBreakdown(indicators))
      setLastUpdate(new Date())
      setNewsLoading(true)
      fetchNewsAnalysis(price, fg, btcDom).then(n => { setNews(n); setNewsLoading(false) })
    } catch (e) { setError('โหลดไม่ได้: ' + e.message) } finally { setLoading(false); setRefreshing(false) }
  }, [])

  const startTimers = useCallback(() => {
    clearInterval(timerRef.current); clearInterval(countRef.current)
    setCountdown(AUTO_REFRESH_SEC)
    countRef.current = setInterval(() => setCountdown(c => c <= 1 ? AUTO_REFRESH_SEC : c - 1), 1000)
    timerRef.current = setInterval(() => { load(true); setCountdown(AUTO_REFRESH_SEC) }, AUTO_REFRESH_SEC * 1000)
  }, [load])

  useEffect(() => { load().then(startTimers); return () => { clearInterval(timerRef.current); clearInterval(countRef.current) } }, [load, startTimers])

  const handleRefresh = () => { load(true); startTimers() }

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, background: '#f2ede4' }}>
      <div style={{ fontSize: 36, animation: 'spin 1s linear infinite' }}>⟳</div>
      <div style={{ color: '#888', fontSize: 13 }}>กำลังโหลดข้อมูลตลาด ETH...</div>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )

  const sig = score !== null ? getSignal(score) : null
  const up = (ind?.pctChange ?? 0) >= 0
  const newsScore = news?.news_score ?? (news?.news ? `${news.news.filter(n => n.tag === 'บวก').length}/${news.news.length}` : '—')

  // --- [ADVANCED PREDICTION LOGIC] ---
  const getPrediction = () => {
    if (!ind || score === null) return { up: 50, down: 50, label: 'คำนวณ...' }
    let baseUp = score
    const volEffect = (ind.volPct || 0) * 0.2 // Volume มีผลต่อความมั่นใจ 20% ของการแกว่ง
    if (ind.pctChange > 0) baseUp += volEffect // ราคาขึ้น + Vol เพิ่ม = มั่นใจขึ้น
    else baseUp -= volEffect // ราคาลง + Vol เพิ่ม = ยิ่งน่าจะลงต่อ
    if (ind.rsi > 70) baseUp -= 5 // Overbought ลดโอกาสไปต่อ
    if (ind.rsi < 30) baseUp += 5 // Oversold เพิ่มโอกาสเด้ง
    const finalUp = Math.min(Math.max(Math.round(baseUp), 5), 95)
    return { up: finalUp, down: 100 - finalUp, label: finalUp > 55 ? 'Bullish Sentiment' : finalUp < 45 ? 'Bearish Pressure' : 'Neutral / Side-way' }
  }
  const pred = getPrediction()

  return (
    <div style={{ background: '#f2ede4', minHeight: '100vh', maxWidth: 520, margin: '0 auto', paddingBottom: 36, fontFamily: "-apple-system,sans-serif" }}>
      
      {/* HEADER */}
      <Card style={{ marginTop: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, color: '#1E40AF', fontWeight: 600, marginBottom: 4 }}>ETH / USD — H1 Spot</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#1a1612' }}>${ind?.price?.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
              {ind?.ethThb && <div style={{ fontSize: 21, color: '#FF69B4', fontWeight: 600 }}>≈ ฿{ind.ethThb.toLocaleString()}</div>}
            </div>
            <div style={{ fontSize: 15, color: up ? '#2d6a4f' : '#c0392b', marginTop: 4, fontWeight: 700 }}>{up ? '+' : ''}{ind?.pctChange?.toFixed(1)}% วันนี้</div>
          </div>
          <GaugeRing score={score ?? 0} />
        </div>
      </Card>

      {/* SIGNAL */}
      {sig && (
        <div style={{ margin: '0 16px', background: sig.bg, border: `1px solid ${sig.border}`, borderRadius: 14, padding: '12px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 30, height: 30, borderRadius: '50%', background: sig.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700 }}>{sig.icon}</div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 15, color: sig.color }}>{sig.th}</div>
              <div style={{ fontSize: 11, color: sig.color + 'cc' }}>{sig.sub}</div>
            </div>
          </div>
        </div>
      )}

      {/* NEW PREDICTION BLOCK */}
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <SecTitle>คาดการณ์ราคาในอีก 24 ช.ม.</SecTitle>
          <span style={{ fontSize: 10, color: pred.up > 50 ? '#15803d' : '#b91c1c', fontWeight: 800 }}>{pred.label}</span>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1, background: '#f0faf4', borderRadius: 12, padding: '16px 12px', textAlign: 'center', border: '1px solid #dcfce7' }}>
            <div style={{ fontSize: 11, color: '#166534', fontWeight: 700, marginBottom: 6 }}>สูงขึ้นเป็น</div>
            <div style={{ fontSize: 32, fontWeight: 800, color: '#15803d', letterSpacing: -1 }}>{pred.up}%</div>
          </div>
          <div style={{ flex: 1, background: '#fef2f2', borderRadius: 12, padding: '16px 12px', textAlign: 'center', border: '1px solid #fee2e2' }}>
            <div style={{ fontSize: 11, color: '#991b1b', fontWeight: 700, marginBottom: 6 }}>ลดลง</div>
            <div style={{ fontSize: 32, fontWeight: 800, color: '#b91c1c', letterSpacing: -1 }}>{pred.down}%</div>
          </div>
        </div>
        <div style={{ marginTop: 10, textAlign: 'center', fontSize: 10, color: '#a09880' }}>
          Weighting: <span style={{ fontWeight: 700 }}>Indicators (80%) + Volume Analysis (20%)</span>
        </div>
      </Card>

      {/* STATS */}
      <Card style={{ padding: '12px 8px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr' }}>
          <div style={{ textAlign: 'center' }}><div style={{ fontSize: 10, color: '#a09880' }}>Fear & Greed</div><div style={{ fontSize: 22, fontWeight: 800, color: fgColor(ind?.fg ?? 50) }}>{ind?.fg}</div></div>
          <div style={{ textAlign: 'center', borderLeft: '1px solid #ede9e0', borderRight: '1px solid #ede9e0' }}><div style={{ fontSize: 10, color: '#a09880' }}>BTC Dom.</div><div style={{ fontSize: 22, fontWeight: 800 }}>{ind?.btcDom?.toFixed(1)}%</div></div>
          <div style={{ textAlign: 'center' }}><div style={{ fontSize: 10, color: '#a09880' }}>ATR (H1)</div><div style={{ fontSize: 22, fontWeight: 800 }}>${ind?.atr?.toFixed(2)}</div></div>
        </div>
      </Card>

      {/* TECHNICAL */}
      <Card>
        <SecTitle>Technical Indicators</SecTitle>
        <IndRow dotColor="#52b788" label="EMA 9/21 H1" value={ind?.ema9 > ind?.ema21 ? 'Fast > Slow ▲' : 'Fast < Slow ▼'} valueColor={ind?.ema9 > ind?.ema21 ? '#2d6a4f' : '#c0392b'} />
        <IndRow dotColor="#52b788" label="EMA H4 Filter" value={ind?.price > ind?.ema21h4 ? 'Price > EMA21 ✓' : 'Price < EMA21 ✗'} valueColor={ind?.price > ind?.ema21h4 ? '#2d6a4f' : '#c0392b'} />
        <IndRow dotColor="#52b788" label="ADX Strength" value={ind?.adx?.toFixed(1)} valueColor={ind?.adx > 25 ? '#2d6a4f' : '#c07a30'} bar={{ value: ind?.adx ?? 0, max: 60, color: ind?.adx > 25 ? '#52b788' : '#f4a261' }} />
        <IndRow dotColor="#f4a261" label="RSI (14)" value={ind?.rsi?.toFixed(1)} valueColor={ind?.rsi > 70 ? '#e63946' : ind?.rsi < 30 ? '#c0392b' : '#2d6a4f'} bar={{ value: ind?.rsi ?? 0, max: 100, color: ind?.rsi > 70 ? '#e63946' : ind?.rsi < 30 ? '#c0392b' : '#f4a261' }} />
        <IndRow dotColor="#52b788" label="Volume Trend" value={`${(ind?.volPct ?? 0) >= 0 ? 'เพิ่มขึ้น +' : 'ลดลง '}${Math.abs(ind?.volPct ?? 0)}%`} valueColor={(ind?.volPct ?? 0) >= 0 ? '#2d6a4f' : '#c0392b'} last />
      </Card>

      {/* SENTIMENT */}
      <Card>
        <SecTitle>Market Sentiment</SecTitle>
        <IndRow dotColor="#52b788" label="Fear & Greed Index" value={`${ind?.fg} — ${fgLabel(ind?.fg ?? 50)}`} valueColor={fgColor(ind?.fg ?? 50)} />
       <IndRow dotColor="#f4a261" label="BTC Correlation" value={`BTC ${ind?.btcChg >= 0 ? '+' : ''}${ind?.btcChg?.toFixed(1)}%`} valueColor={ind?.btcChg >= 0 ? '#2d6a4f' : '#c0392b'} />
        <IndRow dotColor="#52b788" label="Funding Rate" value={ind?.fundingLabel ?? 'N/A'} valueColor={ind?.fundingColor ?? '#888'} last />
      </Card>

      {/* NEWS */}
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}><SecTitle>ข่าว & MACRO 24 ชม.</SecTitle>{newsLoading && <span style={{ fontSize: 10, color: '#b0a898' }}>กำลังโหลด...</span>}</div>
        {(news?.news ?? []).map((n, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 0', borderBottom: i < (news.news.length - 1) ? '1px solid #f2ede4' : 'none' }}>
            <span style={{ fontSize: 10, color: '#b0a898', width: 62, flexShrink: 0, fontWeight: 600 }}>{n.source}</span>
            <span style={{ fontSize: 12, color: '#2a2520', flex: 1, lineHeight: 1.5 }}>{n.headline}</span>
            <Tag label={n.tag} />
          </div>
        ))}
      </Card>

      {/* SUMMARY */}
      <Card>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          {[{ label: 'Technical', val: breakdown?.tech, ok: breakdown?.techOk }, { label: 'Sentiment', val: breakdown?.sent, ok: breakdown?.sentOk }, { label: 'News', val: newsScore, ok: news?.news?.filter(n => n.tag === 'บวก').length >= 2 }].map((item, i) => (
            <div key={i} style={{ flex: 1, textAlign: 'center', padding: '8px 4px', borderRadius: 10, background: item.ok ? '#f0faf4' : '#fdf0f0' }}>
              <div style={{ fontSize: 10, color: '#a09880', fontWeight: 600 }}>{item.label}</div>
              <div style={{ fontSize: 17, fontWeight: 800, marginTop: 2, color: item.ok ? '#2d6a4f' : '#c0392b' }}>{item.val}</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: item.ok ? '#52b788' : '#c0392b' }}>{item.ok ? '✓' : '✗'}</div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 12, color: '#4a4035', lineHeight: 1.8, padding: '10px 14px', background: '#f8f5ef', borderRadius: 10 }}>
          {news?.signal_detail ?? `แนวรับ $${ind?.support?.toFixed(0)} · แนวต้าน $${ind?.resistance?.toFixed(0)}`}
          <div style={{ fontSize: 10, color: '#a09880', marginTop: 6 }}>⚠️ ข้อมูลนี้เพื่อการศึกษาเท่านั้น</div>
        </div>
      </Card>

      {/* REFRESH */}
      <div style={{ margin: '8px 16px 0' }}>
        <button onClick={handleRefresh} disabled={refreshing} style={{ width: '100%', padding: '13px 0', background: '#fff', border: '1.5px solid #ddd8cc', borderRadius: 14, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          {refreshing ? '⟳ กำลังรีเฟรช...' : 'รีเฟรชข้อมูลและข่าวล่าสุด ↗'}
          {!refreshing && <Countdown sec={countdown} total={AUTO_REFRESH_SEC} />}
        </button>
      </div>
    </div>
  )
}