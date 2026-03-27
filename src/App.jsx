import { useState, useEffect, useCallback, useRef } from 'react'
import GaugeRing from './components/GaugeRing.jsx'
import HBar from './components/HBar.jsx'
import { fetchMarketData, fetchNewsAnalysis } from './logic/api.js'
import {
  calcEMA, calcRSI, calcATR, calcADX,
  findSwings, calcVolumeTrend,
  calcForecastScore, getSignal, fgLabel, fgColor
} from './logic/logic.js'

const AUTO_REFRESH_SEC = 60

// ── Card ─────────────────────────────────────────────────────
function Card({ children, style = {} }) {
  return (
    <div style={{
      background: '#ffffff', borderRadius: 14,
      margin: '8px 16px', padding: '14px 18px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
      border: '1px solid #ede9e0',
      ...style
    }}>{children}</div>
  )
}

// ── Section title ─────────────────────────────────────────────
function SecTitle({ children }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 700, color: '#a09880', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 10 }}>
      {children}
    </div>
  )
}

// ── Indicator row ─────────────────────────────────────────────
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

// ── News tag ──────────────────────────────────────────────────
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

// ── Countdown ring ────────────────────────────────────────────
function Countdown({ sec, total }) {
  const r = 10, circ = 2 * Math.PI * r
  const pct = sec / total
  return (
    <div style={{ position: 'relative', width: 26, height: 26 }}>
      <svg width={26} height={26} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={13} cy={13} r={r} fill="none" stroke="#e8e5de" strokeWidth="2.5" />
        <circle cx={13} cy={13} r={r} fill="none" stroke="#52b788" strokeWidth="2.5"
          strokeDasharray={`${pct * circ} ${circ}`} strokeLinecap="round" />
      </svg>
      <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 700, color: '#52b788' }}>{sec}</span>
    </div>
  )
}

// ── App ───────────────────────────────────────────────────────
export default function App() {
  const [loading, setLoading]          = useState(true)
  const [refreshing, setRefreshing]    = useState(false)
  const [error, setError]              = useState(null)
  const [ind, setInd]                  = useState(null)
  const [score, setScore]              = useState(null)
  const [news, setNews]                = useState(null)
  const [newsLoading, setNewsLoading]  = useState(false)
  const [lastUpdate, setLastUpdate]    = useState(null)
  const [countdown, setCountdown]      = useState(AUTO_REFRESH_SEC)
  const timerRef  = useRef(null)
  const countRef  = useRef(null)

  const load = useCallback(async (isRefresh = false) => {
    isRefresh ? setRefreshing(true) : setLoading(true)
    setError(null)
    try {
      // 1. ดึงข้อมูลตลาด
      const { h1, h4, btcCloses, fg, btcDom } = await fetchMarketData()

      const closes = h1.map(k => k.c), highs = h1.map(k => k.h)
      const lows   = h1.map(k => k.l), vols  = h1.map(k => k.v)
      const h4c    = h4.map(k => k.c)

      const price       = closes[closes.length - 1]
      const price24hAgo = closes[closes.length - 25] ?? closes[0]
      const pctChange   = ((price - price24hAgo) / price24hAgo) * 100

      // --- [จุดที่แก้]: คำนวณราคาเงินบาท (THB) โดยคูณเรทปัจจุบัน (เช่น 36.5) ---
      const usdThbRate = 32.2 
      const ethThb = price * usdThbRate

      const ema9    = calcEMA(closes.slice(-60), 9)
      const ema21   = calcEMA(closes.slice(-60), 21)
      const ema55   = calcEMA(closes.slice(-60), 55)
      const ema21h4 = calcEMA(h4c, 21)
      const rsi     = calcRSI(closes.slice(-30), 14)
      const atr     = calcATR(highs.slice(-30), lows.slice(-30), closes.slice(-30), 14)
      const { adx, plusDI, minusDI } = calcADX(highs.slice(-60), lows.slice(-60), closes.slice(-60), 14)
      const { support, resistance }  = findSwings(highs, lows, 24)
      const { ratio: volRatio, pct: volPct } = calcVolumeTrend(vols)
      const btcChg = ((btcCloses[btcCloses.length - 1] - btcCloses[0]) / btcCloses[0]) * 100

      // ส่งค่า ethThb เข้าไปใน Object เพื่อนำไปแสดงผล
      const indicators = { price, pctChange, ema9, ema21, ema55, ema21h4, rsi, atr, adx, plusDI, minusDI, volRatio, volPct, fg, btcChg, btcDom, support, resistance, ethThb }
      
      setInd(indicators)
      setScore(calcForecastScore(indicators))
      setLastUpdate(new Date())

      setNewsLoading(true)
      fetchNewsAnalysis(price, fg, btcDom).then(n => { setNews(n); setNewsLoading(false) })
    } catch (e) {
      setError('โหลดไม่ได้: ' + e.message)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  // Auto-refresh logic
  const startTimers = useCallback(() => {
    clearInterval(timerRef.current)
    clearInterval(countRef.current)
    setCountdown(AUTO_REFRESH_SEC)

    countRef.current = setInterval(() => {
      setCountdown(c => (c <= 1 ? AUTO_REFRESH_SEC : c - 1))
    }, 1000)

    timerRef.current = setInterval(() => {
      load(true)
    }, AUTO_REFRESH_SEC * 1000)
  }, [load])

  useEffect(() => {
    load().then(startTimers)
    return () => { clearInterval(timerRef.current); clearInterval(countRef.current) }
  }, [load, startTimers])

  const handleRefresh = () => {
    load(true)
    startTimers()
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, background: '#f2ede4' }}>
      <div style={{ fontSize: 36, animation: 'spin 1s linear infinite' }}>⟳</div>
      <div style={{ color: '#888', fontSize: 13 }}>กำลังโหลดข้อมูลตลาด ETH...</div>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )

  const sig = score !== null ? getSignal(score) : null
  const up  = (ind?.pctChange ?? 0) >= 0

  return (
    <div style={{ background: '#f2ede4', minHeight: '100vh', maxWidth: 520, margin: '0 auto', paddingBottom: 36, fontFamily: "-apple-system, 'Helvetica Neue', 'Segoe UI', sans-serif" }}>

      {/* ── HEADER ── */}
      <Card style={{ marginTop: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: '#a09880', fontWeight: 600, letterSpacing: 0.5, marginBottom: 4 }}>ETH / USD — H1 Spot</div>

            {/* USD price + THB inline */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#1a1612', letterSpacing: -0.5, lineHeight: 1 }}>
                ${ind?.price?.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              {/* แสดงผลเงินบาท */}
              {ind?.ethThb && (
                <div style={{ fontSize: 15, color: '#8a7f6e', fontWeight: 600 }}>
                  ≈ ฿{ind.ethThb.toLocaleString('th', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </div>
              )}
            </div>

            {/* 24h change */}
            <div style={{ fontSize: 13, color: up ? '#2d6a4f' : '#c0392b', marginTop: 4, fontWeight: 700 }}>
              {up ? '+' : ''}{ind?.pctChange?.toFixed(1)}% วันนี้
            </div>
          </div>
          <GaugeRing score={score ?? 0} />
        </div>
      </Card>

      {/* ── SIGNAL ── */}
      {sig && (
        <div style={{ margin: '0 16px', background: sig.bg, border: `1px solid ${sig.border}`, borderRadius: 14, padding: '12px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 30, height: 30, borderRadius: '50%', background: sig.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0, fontWeight: 700 }}>
              {sig.icon}
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 15, color: sig.color }}>{sig.th}</div>
              <div style={{ fontSize: 11, color: sig.color + 'cc', marginTop: 2 }}>{sig.sub}</div>
            </div>
          </div>
        </div>
      )}

      {/* ── STATS 3-col ── */}
      <Card style={{ padding: '12px 8px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr' }}>
          {[
            { label: 'Fear & Greed', value: ind?.fg ?? '—', color: fgColor(ind?.fg ?? 50) },
            { label: 'BTC Dom.', value: `${ind?.btcDom?.toFixed(1)}%`, color: '#4a4035', border: true },
            { label: 'ATR (H1)', value: `$${ind?.atr?.toFixed(2) ?? '—'}`, color: '#4a4035' },
          ].map((s, i) => (
            <div key={i} style={{
              textAlign: 'center', padding: '4px 6px',
              borderLeft: s.border ? '1px solid #ede9e0' : 'none',
              borderRight: s.border ? '1px solid #ede9e0' : 'none',
            }}>
              <div style={{ fontSize: 10, color: '#a09880', fontWeight: 600, letterSpacing: 0.3 }}>{s.label}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: s.color, marginTop: 3, letterSpacing: -0.5 }}>{s.value}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* ── TECHNICAL ── */}
      <Card>
        <SecTitle>Technical Indicators</SecTitle>
        <IndRow dotColor="#52b788" label="EMA 9/21 H1"
          value={ind?.ema9 > ind?.ema21 ? 'Fast > Slow ▲' : 'Fast < Slow ▼'}
          valueColor={ind?.ema9 > ind?.ema21 ? '#2d6a4f' : '#c0392b'} />
        <IndRow dotColor="#52b788" label="EMA H4 Filter"
          value={ind?.price > ind?.ema21h4 ? 'Price > EMA21 ✓' : 'Price < EMA21 ✗'}
          valueColor={ind?.price > ind?.ema21h4 ? '#2d6a4f' : '#c0392b'} />
        <IndRow dotColor="#52b788" label="ADX Strength"
          value={ind?.adx?.toFixed(1) ?? '—'}
          valueColor={ind?.adx > 25 ? '#2d6a4f' : '#c07a30'}
          bar={{ value: ind?.adx ?? 0, max: 60, color: ind?.adx > 25 ? '#52b788' : '#f4a261' }} />
        <IndRow dotColor="#52b788" label="+DI / -DI"
          value={ind?.plusDI > ind?.minusDI ? '+DI > -DI ▲' : '+DI < -DI ▼'}
          valueColor={ind?.plusDI > ind?.minusDI ? '#2d6a4f' : '#c0392b'} />
        <IndRow dotColor="#f4a261" label="RSI (14)"
          value={ind?.rsi?.toFixed(1) ?? '—'}
          valueColor={ind?.rsi > 70 ? '#e63946' : ind?.rsi < 30 ? '#c0392b' : '#c07a30'}
          bar={{ value: ind?.rsi ?? 0, max: 100, color: ind?.rsi > 70 ? '#e63946' : '#f4a261' }} />
        <IndRow dotColor="#52b788" label="Volume Trend"
          value={`${(ind?.volPct ?? 0) >= 0 ? 'เพิ่มขึ้น +' : 'ลดลง '}${Math.abs(ind?.volPct ?? 0)}%`}
          valueColor={(ind?.volPct ?? 0) >= 0 ? '#2d6a4f' : '#c0392b'}
          last />
      </Card>

      {/* ── SENTIMENT ── */}
      <Card>
        <SecTitle>Market Sentiment</SecTitle>
        <IndRow dotColor="#52b788" label="Fear & Greed Index"
          value={`${ind?.fg} — ${fgLabel(ind?.fg ?? 50)}`}
          valueColor={fgColor(ind?.fg ?? 50)} />
        <IndRow dotColor="#f4a261" label="BTC Correlation"
          value={`BTC ${ind?.btcChg >= 0 ? '+' : ''}${ind?.btcChg?.toFixed(1)}% ${ind?.btcChg >= 0 ? '▲ นำ' : '▼ ลง'}`}
          valueColor={ind?.btcChg >= 0 ? '#2d6a4f' : '#c0392b'} />
        <IndRow dotColor="#f4a261" label="BTC Dominance"
          value={`${ind?.btcDom?.toFixed(1)}% → ${ind?.btcDom > 55 ? 'สูง' : 'ปกติ'}`}
          valueColor="#4a4035" />
        <IndRow dotColor="#52b788" label="Funding Rate"
          value="+0.012% ปกติ" valueColor="#2d6a4f" last />
      </Card>

      {/* ── NEWS ── */}
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <SecTitle>ข่าว &amp; MACRO 24 ชั่วโมงล่าสุด</SecTitle>
          {newsLoading && <span style={{ fontSize: 10, color: '#b0a898', marginTop: -10 }}>กำลังโหลด...</span>}
        </div>
        {(news?.news ?? []).map((n, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'flex-start', gap: 8,
            padding: '8px 0', borderBottom: i < (news.news.length - 1) ? '1px solid #f2ede4' : 'none'
          }}>
            <span style={{ fontSize: 10, color: '#b0a898', width: 62, flexShrink: 0, paddingTop: 1, fontWeight: 600 }}>{n.source}</span>
            <span style={{ fontSize: 12, color: '#2a2520', flex: 1, lineHeight: 1.5 }}>{n.headline}</span>
            <Tag label={n.tag} />
          </div>
        ))}
      </Card>

      {/* ── SUMMARY ── */}
      <Card>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          {[
            { label: 'Technical', val: news?.tech_score ?? '—' },
            { label: 'Sentiment', val: news?.sent_score ?? '—' },
            { label: 'News',      val: news?.news_score ?? '—' },
          ].map((item, i) => (
            <div key={i} style={{ flex: 1, textAlign: 'center', padding: '8px 4px', background: '#f8f5ef', borderRadius: 10 }}>
              <div style={{ fontSize: 10, color: '#a09880', fontWeight: 600 }}>{item.label}</div>
              <div style={{ fontSize: 17, fontWeight: 800, color: '#2d6a4f', marginTop: 2 }}>{item.val}</div>
              <div style={{ fontSize: 11, color: '#52b788', fontWeight: 700 }}>✓</div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 12, color: '#4a4035', lineHeight: 1.8, padding: '10px 14px', background: '#f8f5ef', borderRadius: 10 }}>
          {news?.signal_detail ?? `แนวรับ $${ind?.support?.toFixed(0)} · แนวต้าน $${ind?.resistance?.toFixed(0)}`}
        </div>
      </Card>

      {/* ── REFRESH ── */}
      <div style={{ margin: '8px 16px 0' }}>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          style={{
            width: '100%', padding: '13px 0', background: '#fff',
            border: '1.5px solid #ddd8cc', borderRadius: 14,
            fontSize: 14, color: '#2a2520', cursor: refreshing ? 'not-allowed' : 'pointer',
            fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            opacity: refreshing ? 0.6 : 1, fontFamily: 'inherit', transition: 'opacity 0.2s'
          }}
        >
          {refreshing ? '⟳ กำลังรีเฟรช...' : 'รีเฟรชข้อมูลและข่าวล่าสุด ↗'}
          {!refreshing && <Countdown sec={countdown} total={AUTO_REFRESH_SEC} />}
        </button>

        {/* Status bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, padding: '0 2px' }}>
          {lastUpdate && (
            <span style={{ fontSize: 10, color: '#b0a898' }}>
              อัปเดตล่าสุด {lastUpdate.toLocaleTimeString('th-TH')}
            </span>
          )}
          <span style={{ fontSize: 10, color: '#b0a898' }}>
            Auto-refresh ทุก {AUTO_REFRESH_SEC} วินาที
          </span>
        </div>
        {error && <div style={{ color: '#e63946', fontSize: 11, textAlign: 'center', marginTop: 6 }}>{error}</div>}
      </div>
    </div>
  )
}