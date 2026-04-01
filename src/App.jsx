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

const AUTO_REFRESH_SEC  = 30
const NEWS_REFRESH_MS   = 6 * 60 * 60 * 1000   // 6 ชั่วโมง

// ─────────────────────────────────────────────────────────────
// MARKET PHASE — คำนวณสถานะ Breakout / Squeeze
// Logic: ADX + Price vs EMA21 + DI direction
// ─────────────────────────────────────────────────────────────
function calcMarketPhase(ind) {
  if (!ind) return null
  const { adx, plusDI, minusDI, price, ema21h4, ema9, ema21, volRatio } = ind

  // Phase 1: Squeeze — ราคากำลังบีบตัว (ADX อ่อน, Volume ต่ำ)
  if (adx !== null && adx < 20) {
    return {
      phase: 'squeeze',
      label: 'ราคากำลังบีบตัว (Squeeze)',
      sublabel: 'พลังงานสะสม รอทิศทาง Breakout',
      icon: '⚡',
      color: '#c07a30',
      bg: '#fffbeb',
      border: '#fde68a',
      barColor: '#f59e0b',
      strength: Math.round((20 - adx) / 20 * 100),   // ยิ่ง ADX ต่ำ ยิ่ง squeeze แน่น
      detail: `ADX ${adx?.toFixed(1)} < 20 — ตลาดไม่มีทิศทางชัดเจน · ${volRatio < 0.9 ? 'Volume แห้ง ยืนยัน Squeeze' : 'Volume ปกติ'}`,
      hint: 'รอสัญญาณ Breakout ตลาดยังไม่เลือกช้าง',
    }
  }

  // Phase 2: Bullish Breakout — ADX > 20 + ราคาเหนือ EMA21 + +DI > -DI
  if (
    adx !== null && adx >= 20 &&
    price !== null && ema21h4 !== null && price > ema21h4 &&
    plusDI !== null && minusDI !== null && plusDI > minusDI
  ) {
    const strength = Math.min(100, Math.round(
      ((adx - 20) / 40) * 50 +           // ADX contribution (0-50)
      ((plusDI - minusDI) / 30) * 30 +    // DI spread (0-30)
      (price > ema21 ? 20 : 0)            // EMA9/21 aligned (0-20)
    ))
    return {
      phase: 'bullish',
      label: 'กำลังพุ่งสูงขึ้น (Bullish Breakout)',
      sublabel: 'Trend ขาขึ้น — Momentum แข็ง',
      icon: '🚀',
      color: '#2d6a4f',
      bg: '#f0fdf4',
      border: '#86efac',
      barColor: '#22c55e',
      strength,
      detail: `ADX ${adx?.toFixed(1)} · +DI ${plusDI?.toFixed(1)} > -DI ${minusDI?.toFixed(1)} · Price > EMA21`,
      hint: adx > 40 ? 'Trend แข็งมาก — ระวัง Overbought ซื้อมากเกินไป' : 'Trend ขาขึ้น — สามารถพิจารณาถือต่อ',
    }
  }

  // Phase 3: Bearish Breakout — ADX > 20 + ราคาต่ำกว่า EMA21 + -DI > +DI
  if (
    adx !== null && adx >= 20 &&
    price !== null && ema21h4 !== null && price < ema21h4 &&
    plusDI !== null && minusDI !== null && minusDI > plusDI
  ) {
    const strength = Math.min(100, Math.round(
      ((adx - 20) / 40) * 50 +
      ((minusDI - plusDI) / 30) * 30 +
      (price < ema21 ? 20 : 0)
    ))
    return {
      phase: 'bearish',
      label: 'กำลังดิ่งลง (Bearish Breakout)',
      sublabel: 'Trend ขาลง — แรงขายครอบงำ',
      icon: '📉',
      color: '#9b2226',
      bg: '#fff1f2',
      border: '#fca5a5',
      barColor: '#ef4444',
      strength,
      detail: `ADX ${adx?.toFixed(1)} · -DI ${minusDI?.toFixed(1)} > +DI ${plusDI?.toFixed(1)} · Price < EMA21`,
      hint: adx > 40 ? 'Trend ลงแรงมาก — หลีกเลี่ยงการซื้อ' : 'Trend ขาลง — ระวัง ไม่ควรซื้อ',
    }
  }

  // Phase กลาง: ADX > 20 แต่สัญญาณยังขัดแย้ง
  return {
    phase: 'mixed',
    label: 'สัญญาณผสม (Transition)',
    sublabel: 'ADX เริ่มแข็ง แต่ทิศทางยังไม่ชัด',
    icon: '🔄',
    color: '#7b6914',
    bg: '#fffbeb',
    border: '#fde68a',
    barColor: '#f59e0b',
    strength: Math.round(adx / 60 * 100),
    detail: `ADX ${adx?.toFixed(1)} · Price${price > ema21h4 ? ' > ' : ' < '}EMA21 · DI${plusDI > minusDI ? ' Bullish' : ' Bearish'}`,
    hint: 'รอสัญญาณยืนยันก่อนตัดสินใจ',
  }
}

// ─────────────────────────────────────────────
// calcProb24h
// ─────────────────────────────────────────────
function calcProb24h(score, ind) {
  if (!ind) return 50
  let base = (score - 50) * 0.6 + 50
  let adj = 0
  if (ind.rsi !== undefined) {
    if (ind.rsi > 65)      adj -= 5
    else if (ind.rsi < 35) adj += 7
    else if (ind.rsi > 55) adj += 3
    else if (ind.rsi < 45) adj -= 3
  }
  if (ind.pctChange !== undefined) {
    if (ind.pctChange > 5)       adj -= 4
    else if (ind.pctChange > 2)  adj += 2
    else if (ind.pctChange < -5) adj += 5
    else if (ind.pctChange < -2) adj -= 2
  }
  if (ind.volPct !== undefined) {
    if (ind.volPct > 20 && ind.pctChange > 0) adj += 3
    if (ind.volPct > 20 && ind.pctChange < 0) adj -= 3
  }
  if (ind.btcChg !== undefined) adj += ind.btcChg > 0 ? 2 : -2
  if (ind.fg !== undefined) {
    if (ind.fg < 20)      adj += 4
    else if (ind.fg > 75) adj -= 4
  }
  return Math.round(Math.min(Math.max(base + adj, 15), 85))
}

// ─────────────────────────────────────────────
// MULTI-ASSET PRICES
// ─────────────────────────────────────────────
const ASSETS = [
  { label: 'BTC/USD',  binance: 'BTCUSDT',  thbRate: false, decimals: 0 },
  { label: 'BTC/THB',  binance: 'BTCUSDT',  thbRate: true,  decimals: 0 },
  { label: 'USDT/THB', binance: null,        isUSDT: true,   decimals: 2 },
  { label: 'DOGE/THB', binance: 'DOGEUSDT', thbRate: true,  decimals: 4 },
  { label: 'XRP/THB',  binance: 'XRPUSDT',  thbRate: true,  decimals: 2 },
  { label: 'XAU/USD',  binance: 'PAXGUSDT', isGold: true,   decimals: 2 },
]

async function fetchUSDTHB() {
  try {
    const r = await fetch('https://api.exchangerate-api.com/v4/latest/USD')
    const d = await r.json()
    return d.rates?.THB ?? 34.5
  } catch { return 34.5 }
}

function MultiAssetPrices() {
  const [data, setData]       = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const thbRate = await fetchUSDTHB()
        const uniqueSymbols = [...new Set(ASSETS.filter(a => a.binance).map(a => a.binance))]
        const results = await Promise.all(
          uniqueSymbols.map(s => fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${s}`).then(r => r.json()))
        )
        const priceMap = {}
        uniqueSymbols.forEach((s, i) => {
          priceMap[s] = { price: parseFloat(results[i].lastPrice), chg: parseFloat(results[i].priceChangePercent) }
        })
        const rows = ASSETS.map(a => {
          if (a.isUSDT) return { label: a.label, price: thbRate, chg: null, unit: ' ', decimals: a.decimals }
          const b = priceMap[a.binance]
          if (!b) return null
          const price = a.thbRate ? b.price * thbRate : b.price
          return { label: a.label, price, chg: b.chg, unit: !a.thbRate ? '$ ' : ' ', decimals: a.decimals }
        }).filter(Boolean)
        setData(rows)
      } catch (e) { console.error(e) }
      finally { setLoading(false) }
    }
    load()
    const t = setInterval(load, 30000)
    return () => clearInterval(t)
  }, [])

  if (loading) return <div style={{ textAlign: 'center', color: '#b0a898', fontSize: 13, padding: 12 }}>กำลังโหลดราคา...</div>

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
      {data.map((item, i) => {
        const isNeutral = item.chg === null
        const up  = !isNeutral && item.chg >= 0
        const col = isNeutral ? '#FF69B4' : up ? '#16a34a' : '#dc2626'
        const bg  = isNeutral ? '#f8f5ef' : up ? '#f0faf4' : '#fef2f2'
        const bd  = isNeutral ? '#ede9e0' : up ? '#bbf7d0' : '#fecaca'
        return (
          <div key={i} style={{ background: bg, border: `1px solid ${bd}`, borderRadius: 10, padding: '10px 12px' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#a09880', letterSpacing: 0.5, marginBottom: 4 }}>{item.label}</div>
            <div style={{ fontSize: item.price > 999999 ? 16 : 18, fontWeight: 800, color: col, letterSpacing: -0.3 }}>
              {item.unit}{item.price.toLocaleString('en', { minimumFractionDigits: item.decimals, maximumFractionDigits: item.decimals })}
            </div>
            {!isNeutral && (
              <div style={{ fontSize: 13, fontWeight: 700, color: col, marginTop: 2 }}>
                {up ? '▲ +' : '▼ '}{Math.abs(item.chg).toFixed(2)}%
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─────────────────────────────────────────────
// SHARED COMPONENTS
// ─────────────────────────────────────────────
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
    <div style={{ fontSize: 14, fontWeight: 700, color: '#a09880', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 10 }}>
      {children}
    </div>
  )
}

function IndRow({ dotColor, label, value, valueColor, bar, last }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: last ? 'none' : '1px solid #f2ede4' }}>
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

// ─────────────────────────────────────────────
// MARKET PHASE CARD COMPONENT
// ─────────────────────────────────────────────
function MarketPhaseCard({ phase }) {
  if (!phase) return null

  // Phase icons map
  const phaseIcons = {
    squeeze: { left: '📊', right: '⏳' },
    bullish: { left: '📈', right: '💪' },
    bearish: { left: '📉', right: '⚠️' },
    mixed:   { left: '🔄', right: '❓' },
  }
  const icons = phaseIcons[phase.phase] || { left: '📊', right: '?' }

  return (
    <div style={{
      margin: '8px 16px',
      background: phase.bg,
      border: `1.5px solid ${phase.border}`,
      borderRadius: 14,
      overflow: 'hidden',
    }}>
      {/* Header bar */}
      <div style={{
        background: phase.color,
        padding: '10px 16px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 20 }}>{icons.left}</span>
          <div>
            <div style={{ fontSize: 15, color: 'rgba(255,255,255,0.8)', fontWeight: 600, letterSpacing: 0.5 }}>
              MARKET PHASE
            </div>
            <div style={{ fontSize: 14, color: '#fff', fontWeight: 800 }}>
              {phase.label}
            </div>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>ความแรง</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#fff', lineHeight: 1 }}>
            {phase.strength}%
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: '12px 16px' }}>

        {/* Strength bar */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 13, color: phase.color, fontWeight: 700 }}>Trend Strength</span>
            <span style={{ fontSize: 13, color: phase.color, fontWeight: 700 }}>{phase.strength}%</span>
          </div>
          <div style={{ height: 8, background: `${phase.border}`, borderRadius: 4, overflow: 'hidden' }}>
            <div style={{
              width: `${phase.strength}%`, height: '100%',
              background: phase.barColor, borderRadius: 4,
              transition: 'width 1s ease',
            }} />
          </div>
        </div>

        {/* 3 state pills */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          {[
            { key: 'squeeze', label: '🟡 Squeeze',         active: phase.phase === 'squeeze' },
            { key: 'bullish', label: '🟢 Bullish Breakout', active: phase.phase === 'bullish' },
            { key: 'bearish', label: '🔴 Bearish Breakout', active: phase.phase === 'bearish' },
          ].map(p => (
            <div key={p.key} style={{
              flex: 1, textAlign: 'center',
              padding: '5px 4px',
              borderRadius: 8,
              fontSize: 10,
              fontWeight: p.active ? 800 : 500,
              background: p.active ? phase.color : 'rgba(0,0,0,0.04)',
              color: p.active ? '#fff' : '#a09880',
              border: p.active ? `1px solid ${phase.color}` : '1px solid #e5e0d8',
              transition: 'all 0.3s',
            }}>
              {p.label}
            </div>
          ))}
        </div>

        {/* Detail */}
        <div style={{
          fontSize: 12, color: '#6b5e4e',
          background: 'rgba(0,0,0,0.04)',
          borderRadius: 8, padding: '8px 10px',
          marginBottom: 8, lineHeight: 1.6,
        }}>
          {phase.detail}
        </div>

        {/* Hint */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '7px 10px',
          background: phase.bg,
          borderRadius: 8,
          border: `1px solid ${phase.border}`,
        }}>
          <span style={{ fontSize: 14 }}>{icons.right}</span>
          <span style={{ fontSize: 12, color: phase.color, fontWeight: 700 }}>
            {phase.hint}
          </span>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// MAIN APP
// ─────────────────────────────────────────────
export default function App() {
  const [loading, setLoading]           = useState(true)
  const [refreshing, setRefreshing]     = useState(false)
  const [error, setError]               = useState(null)
  const [ind, setInd]                   = useState(null)
  const [score, setScore]               = useState(null)
  const [breakdown, setBreakdown]       = useState(null)
  const [news, setNews]                 = useState(null)
  const [newsLoading, setNewsLoading]   = useState(false)
  const [newsLastFetch, setNewsLastFetch] = useState(null)   // [NEW] เวลาที่ดึงข่าวครั้งล่าสุด
  const [lastUpdate, setLastUpdate]     = useState(null)
  const [countdown, setCountdown]       = useState(AUTO_REFRESH_SEC)
  const timerRef    = useRef(null)
  const countRef    = useRef(null)
  const newsTimerRef = useRef(null)   // [NEW] timer แยกสำหรับข่าว

  // ── ดึงข่าว — ใช้ in-memory ref ไม่พึ่ง localStorage ────────
  const newsParamsRef = useRef(null)   // เก็บ params ล่าสุดสำหรับ timer

  const doFetchNews = useCallback(async (price, fg, btcDom) => {
    setNewsLoading(true)
    try {
      const n = await fetchNewsAnalysis(price, fg, btcDom)
      setNews(n)
      setNewsLastFetch(new Date())
    } catch (e) {
      console.warn('News fetch failed:', e)
    } finally {
      setNewsLoading(false)
    }
  }, [])

  const startNewsTimer = useCallback((price, fg, btcDom) => {
    newsParamsRef.current = { price, fg, btcDom }
    clearInterval(newsTimerRef.current)
    newsTimerRef.current = setInterval(() => {
      // ดึงข่าวใหม่ทุก 6 ชม. โดยอัตโนมัติ
      if (newsParamsRef.current) {
        const { price, fg, btcDom } = newsParamsRef.current
        doFetchNews(price, fg, btcDom)
      }
    }, NEWS_REFRESH_MS)
  }, [doFetchNews])

  const load = useCallback(async (isRefresh = false) => {
    isRefresh ? setRefreshing(true) : setLoading(true)
    setError(null)
    try {
      const { h1, h4, btcCloses, fg, btcDom, ethThb, fundingLabel, fundingColor } = await fetchMarketData()

      const closes = h1.map(k => k.c), highs = h1.map(k => k.h)
      const lows   = h1.map(k => k.l), vols  = h1.map(k => k.v)
      const h4c    = h4.map(k => k.c)

      const price       = closes[closes.length - 1]
      const price24hAgo = closes[closes.length - 25] ?? closes[0]
      const pctChange   = ((price - price24hAgo) / price24hAgo) * 100

      const ema9    = calcEMA(closes.slice(-60), 9)
      const ema21   = calcEMA(closes.slice(-60), 21)
      const ema55   = calcEMA(closes.slice(-60), 55)
      const ema21h4 = calcEMA(h4c, 21)
      const rsi     = calcRSI(closes.slice(-30), 14)
      const atr     = calcATR(highs.slice(-30), lows.slice(-30), closes.slice(-30), 14)
      const { adx, plusDI, minusDI } = calcADX(highs.slice(-60), lows.slice(-60), closes.slice(-60), 14)
      const { support, resistance }  = findSwings(highs, lows, 100, 3)
      const { ratio: volRatio, pct: volPct } = calcVolumeTrend(vols)

      const btcChg = btcCloses.length >= 25
        ? ((btcCloses[btcCloses.length - 1] - btcCloses[btcCloses.length - 25]) / btcCloses[btcCloses.length - 25]) * 100
        : 0

      const indicators = {
        price, pctChange, ema9, ema21, ema55, ema21h4,
        rsi, atr, adx, plusDI, minusDI,
        volRatio, volPct, fg, btcChg, btcDom,
        support, resistance, ethThb,
        fundingLabel, fundingColor,
      }

      setInd(indicators)
      const s = calcForecastScore(indicators)
      setScore(s)
      setBreakdown(calcScoreBreakdown(indicators))
      setLastUpdate(new Date())

      // ดึงข่าว:
      //  - ครั้งแรก (isRefresh=false) → ดึงเสมอ
      //  - กด Refresh ราคา (isRefresh=true) → ดึงข่าวถ้า timer ครบ 6 ชม.แล้ว
      const nowMs = Date.now()
      const lastFetchMs = newsTimerRef._lastFetch ?? 0
      if (!isRefresh || (nowMs - lastFetchMs) >= NEWS_REFRESH_MS) {
        doFetchNews(price, fg, btcDom)
        newsTimerRef._lastFetch = nowMs
      }
      startNewsTimer(price, fg, btcDom)
    } catch (e) {
      setError('โหลดไม่ได้: ' + e.message)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [doFetchNews, startNewsTimer])

  const startTimers = useCallback(() => {
    clearInterval(timerRef.current)
    clearInterval(countRef.current)
    setCountdown(AUTO_REFRESH_SEC)
    countRef.current = setInterval(() => setCountdown(c => c <= 1 ? AUTO_REFRESH_SEC : c - 1), 1000)
    timerRef.current = setInterval(() => { load(true); setCountdown(AUTO_REFRESH_SEC) }, AUTO_REFRESH_SEC * 1000)
  }, [load])

  useEffect(() => {
    load().then(startTimers)
    return () => {
      clearInterval(timerRef.current)
      clearInterval(countRef.current)
      clearInterval(newsTimerRef.current)   // [NEW] cleanup news timer ด้วย
    }
  }, [])

  const handleRefresh = () => { load(true); startTimers() }

  // บังคับดึงข่าวใหม่ทันที
  const handleForceNewsRefresh = useCallback(() => {
    if (ind) doFetchNews(ind.price, ind.fg, ind.btcDom)
  }, [ind, doFetchNews])

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, background: '#f2ede4' }}>
      <div style={{ fontSize: 36, animation: 'spin 1s linear infinite' }}>⟳</div>
      <div style={{ color: '#888', fontSize: 13 }}>กำลังโหลดข้อมูลตลาด ETH...</div>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )

  const sig        = score !== null ? getSignal(score) : null
  const up         = (ind?.pctChange ?? 0) >= 0
  const newsScore  = news?.news_score ?? (news?.news ? `${news.news.filter(n => n.tag === 'บวก').length}/${news.news.length}` : '—')
  const probUp     = calcProb24h(score ?? 50, ind)
  const probDown   = 100 - probUp
  const marketPhase = calcMarketPhase(ind)  // [NEW]

  return (
    <div style={{ background: '#f2ede4', minHeight: '100vh', maxWidth: 520, margin: '0 auto', paddingBottom: 36, fontFamily: "-apple-system,'Helvetica Neue','Segoe UI',sans-serif" }}>

      {/* HEADER */}
      <Card style={{ marginTop: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, color: '#1E40AF', fontWeight: 600, letterSpacing: 0.5, marginBottom: 4 }}>ETH / USD — H1 Spot</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#1a1612', letterSpacing: -0.5, lineHeight: 1 }}>
                ${ind?.price?.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              {ind?.ethThb && (
                <div style={{ fontSize: 25, color: '#FF69B4', fontWeight: 600 }}>
                  ≈ ฿{ind.ethThb.toLocaleString('th', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </div>
              )}
            </div>
            <div style={{ fontSize: 15, color: up ? '#2d6a4f' : '#c0392b', marginTop: 4, fontWeight: 700 }}>
              {up ? '+' : ''}{ind?.pctChange?.toFixed(1)}% วันนี้
            </div>
          </div>
          <GaugeRing score={score ?? 0} />
        </div>
      </Card>

      {/* SIGNAL */}
      {sig && (
        <div style={{ margin: '0 16px', background: sig.bg, border: `1px solid ${sig.border}`, borderRadius: 14, padding: '12px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 30, height: 30, borderRadius: '50%', background: sig.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0, fontWeight: 700 }}>
              {sig.icon}
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 16, color: sig.color }}>{sig.th}</div>
              <div style={{ fontSize: 15, color: sig.color + 'cc', marginTop: 2 }}>{sig.sub}</div>
            </div>
          </div>
        </div>
      )}

      {/* [NEW] MARKET PHASE BLOCK */}
      <MarketPhaseCard phase={marketPhase} />

      {/* PREDICTION */}
      <Card>
        <SecTitle>คาดการณ์ราคาในอีก 24 ช.ม.</SecTitle>
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1, background: '#f0faf4', borderRadius: 10, padding: '12px', textAlign: 'center', border: '1px solid #dcfce7' }}>
            <div style={{ fontSize: 13, color: '#166534', fontWeight: 700, marginBottom: 4 }}>สูงขึ้นเป็น</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#15803d' }}>{probUp}%</div>
          </div>
          <div style={{ flex: 1, background: '#fef2f2', borderRadius: 10, padding: '12px', textAlign: 'center', border: '1px solid #fee2e2' }}>
            <div style={{ fontSize: 13, color: '#991b1b', fontWeight: 700, marginBottom: 4 }}>ลดลง</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#b91c1c' }}>{probDown}%</div>
          </div>
        </div>
        <div style={{ fontSize: 12, color: '#a09880', marginTop: 8, textAlign: 'center' }}>
          ประเมินจาก RSI {ind?.rsi?.toFixed(0)} · ราคา{up ? 'ขึ้น' : 'ลง'} {Math.abs(ind?.pctChange ?? 0).toFixed(1)}% · Volume {(ind?.volPct ?? 0) >= 0 ? '+' : ''}{ind?.volPct ?? 0}%
        </div>
      </Card>

      {/* STATS 3-col */}
      <Card style={{ padding: '12px 8px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr' }}>
          {[
            { label: 'กลัว & โลภ',   value: ind?.fg ?? '—',                   color: fgColor(ind?.fg ?? 50) },
            { label: 'ส่วนแบ่ง BTC', value: `${ind?.btcDom?.toFixed(1)}%`,     color: '#4a4035', border: true },
            { label: 'ผันผวน ATR',  value: `$${ind?.atr?.toFixed(2) ?? '—'}`, color: '#4a4035' },
          ].map((s, i) => (
            <div key={i} style={{ textAlign: 'center', padding: '4px 6px', borderLeft: s.border ? '1px solid #ede9e0' : 'none', borderRight: s.border ? '1px solid #ede9e0' : 'none' }}>
              <div style={{ fontSize: 14, color: '#a09880', fontWeight: 600, letterSpacing: 0.3 }}>{s.label}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: s.color, marginTop: 3, letterSpacing: -0.5 }}>{s.value}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* TECHNICAL */}
      <Card>
        <SecTitle>Technical Indicators</SecTitle>
        <IndRow dotColor="#52b788" label="EMA 9/21 H1 แนวโน้มระยะสั้น"
          value={ind?.ema9 > ind?.ema21 ? 'Fast > Slow ▲' : 'Fast < Slow ▼'}
          valueColor={ind?.ema9 > ind?.ema21 ? '#2d6a4f' : '#c0392b'} />
        <IndRow dotColor="#52b788" label="EMA H4 Filter แนวโน้มใหญ่"
          value={ind?.price > ind?.ema21h4 ? 'Price > EMA21 ✓' : 'Price < EMA21 ✗'}
          valueColor={ind?.price > ind?.ema21h4 ? '#2d6a4f' : '#c0392b'} />
        <IndRow dotColor="#52b788" label="ADX ดูเทรนด์"
          value={ind?.adx?.toFixed(1) ?? '—'}
          valueColor={ind?.adx > 25 ? (ind?.plusDI > ind?.minusDI ? '#2d6a4f' : '#c0392b') : '#c07a30'}
          bar={{ value: ind?.adx ?? 0, max: 60, color: ind?.adx > 25 ? (ind?.plusDI > ind?.minusDI ? '#52b788' : '#e63946') : '#f4a261' }} />
        <IndRow dotColor="#52b788" label="+Buy / -Sell ยืนยัน:แรงซื้อ/ขาย"
          value={ind?.plusDI > ind?.minusDI ? '+DI > -DI ▲' : '+DI < -DI ▼'}
          valueColor={ind?.plusDI > ind?.minusDI ? '#2d6a4f' : '#c0392b'} />
        <IndRow dotColor="#f4a261" label="RSI (14) มากเกินไป"
          value={ind?.rsi?.toFixed(1) ?? '—'}
          valueColor={ind?.rsi > 70 ? '#e63946' : ind?.rsi < 30 ? '#c0392b' : ind?.rsi > 50 ? '#2d6a4f' : '#c07a30'}
          bar={{ value: ind?.rsi ?? 0, max: 100, color: ind?.rsi > 70 ? '#e63946' : ind?.rsi < 30 ? '#c0392b' : '#f4a261' }} />
        <IndRow dotColor="#52b788" label="Volume Trend ยืนยันทิศทางราคา"
          value={`${(ind?.volPct ?? 0) >= 0 ? 'เพิ่มขึ้น +' : 'ลดลง '}${Math.abs(ind?.volPct ?? 0)}%`}
          valueColor={(ind?.volPct ?? 0) >= 0 ? '#2d6a4f' : '#c0392b'}
          last />
      </Card>

      {/* SENTIMENT */}
      <Card>
        <SecTitle>Market Sentiment</SecTitle>
        <IndRow dotColor="#52b788" label="Fear & Greed ดัชนี:กลัว/โลภ"
          value={`${ind?.fg} — ${fgLabel(ind?.fg ?? 50)}`}
          valueColor={fgColor(ind?.fg ?? 50)} />
        <IndRow dotColor="#f4a261" label="BTC Correlation ทิศทางเดียวกัน"
          value={`BTC ${ind?.btcChg >= 0 ? '+' : ''}${ind?.btcChg?.toFixed(1)}% ${ind?.btcChg >= 0 ? '▲ นำ' : '▼ ลง'}`}
          valueColor={ind?.btcChg >= 0 ? '#2d6a4f' : '#c0392b'} />
        <IndRow dotColor="#f4a261" label="BTC Dominance ส่วนแบ่งตลาด"
          value={`${ind?.btcDom?.toFixed(1)}% → ${ind?.btcDom > 56 ? 'สูง' : ind?.btcDom > 52 ? 'ปกติ' : 'ต่ำ (Alt Season)'}`}
          valueColor={ind?.btcDom > 58 ? '#c0392b' : ind?.btcDom < 52 ? '#2d6a4f' : '#4a4035'} />
        <IndRow dotColor="#52b788" label="Funding Rate ค่าธรรมเนียม"
          value={ind?.fundingLabel ?? 'N/A (Spot)'}
          valueColor={ind?.fundingColor ?? '#888'}
          last />
      </Card>

      {/* NEWS */}
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
          <div>
            <SecTitle>ข่าว &amp; MACRO 24 ชั่วโมงล่าสุด</SecTitle>
            {/* [NEW] แสดงเวลาที่ดึงข่าวล่าสุด */}
            {newsLastFetch && !newsLoading && (
              <div style={{ fontSize: 12, color: '#b0a898', marginTop: -6, marginBottom: 4 }}>
                อัปเดตข่าว: {newsLastFetch.toLocaleString('th-TH', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}
                {' · '}อัปเดตทุก 6 ชม.
              </div>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {newsLoading && <span style={{ fontSize: 11, color: '#b0a898' }}>กำลังโหลด...</span>}
            {/* [NEW] ปุ่มบังคับดึงข่าวใหม่ */}
            <button
              onClick={handleForceNewsRefresh}
              disabled={newsLoading}
              title="บังคับดึงข่าวใหม่ทันที"
              style={{
                background: 'none', border: '1px solid #ddd8cc', borderRadius: 8,
                padding: '3px 8px', fontSize: 11, color: '#a09880',
                cursor: newsLoading ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit', opacity: newsLoading ? 0.5 : 1,
              }}
            >
              {newsLoading ? '⟳' : '↺ ดึงข่าวใหม่'}
            </button>
          </div>
        </div>
        {(news?.news ?? []).map((n, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'flex-start', gap: 8,
            padding: '8px 0', borderBottom: i < (news.news.length - 1) ? '1px solid #f2ede4' : 'none'
          }}>
            <span style={{ fontSize: 11, color: '#b0a898', width: 62, flexShrink: 0, paddingTop: 1, fontWeight: 600 }}>{n.source}</span>
            <span style={{ fontSize: 12, color: '#2a2520', flex: 1, lineHeight: 1.5 }}>{n.headline}</span>
            <Tag label={n.tag} />
          </div>
        ))}
      </Card>

      {/* SUMMARY */}
      <Card>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          {[
            { label: 'Technical', val: breakdown?.tech ?? '—', ok: breakdown?.techOk },
            { label: 'Sentiment', val: breakdown?.sent ?? '—', ok: breakdown?.sentOk },
            { label: 'News',      val: newsScore,              ok: news ? news.news?.filter(n => n.tag === 'บวก').length >= 2 : null },
          ].map((item, i) => (
            <div key={i} style={{
              flex: 1, textAlign: 'center', padding: '8px 4px', borderRadius: 10,
              background: item.ok === null ? '#f8f5ef' : item.ok ? '#f0faf4' : '#fdf0f0',
            }}>
              <div style={{ fontSize: 13, color: '#a09880', fontWeight: 600 }}>{item.label}</div>
              <div style={{ fontSize: 18, fontWeight: 800, marginTop: 2, color: item.ok === null ? '#a09880' : item.ok ? '#2d6a4f' : '#c0392b' }}>{item.val}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: item.ok === null ? '#a09880' : item.ok ? '#52b788' : '#c0392b' }}>
                {item.ok === null ? '—' : item.ok ? '✓' : '✗'}
              </div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 15, color: '#4a4035', lineHeight: 1.8, padding: '10px 14px', background: '#f8f5ef', borderRadius: 10 }}>
          {news?.signal_detail ?? `ประเมินจาก Indicator — แนวรับ $${ind?.support?.toFixed(0)} · แนวต้าน $${ind?.resistance?.toFixed(0)}`}
          <div style={{ fontSize: 13, color: '#a09880', marginTop: 6 }}>
            ⚠️ คำเตือน: นี่เป็นข้อมูลทางเทคนิค ไม่ใช่คำแนะนำการลงทุน
          </div>
        </div>
      </Card>

      {/* MULTI-ASSET PRICES */}
      <Card>
        <SecTitle>ราคาสินทรัพย์อื่น</SecTitle>
        <MultiAssetPrices />
      </Card>

      {/* REFRESH */}
      <div style={{ margin: '8px 16px 0' }}>
        <button onClick={handleRefresh} disabled={refreshing} style={{
          width: '100%', padding: '13px 0', background: '#fff',
          border: '1.5px solid #ddd8cc', borderRadius: 14,
          fontSize: 14, color: '#2a2520', cursor: refreshing ? 'not-allowed' : 'pointer',
          fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          opacity: refreshing ? 0.6 : 1, fontFamily: 'inherit', transition: 'opacity 0.2s'
        }}>
          {refreshing ? '⟳ กำลังรีเฟรช...' : 'รีเฟรชข้อมูลและข่าวล่าสุด ↗'}
          {!refreshing && <Countdown sec={countdown} total={AUTO_REFRESH_SEC} />}
        </button>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, padding: '0 2px' }}>
          {lastUpdate && <span style={{ fontSize: 13, color: '#b0a898' }}>อัปเดตล่าสุด {lastUpdate.toLocaleTimeString('th-TH')}</span>}
          <span style={{ fontSize: 13, color: '#b0a898' }}>Auto-refresh ทุก {AUTO_REFRESH_SEC} วินาที</span>
        </div>
        {error && <div style={{ color: '#e63946', fontSize: 11, textAlign: 'center', marginTop: 6 }}>{error}</div>}
      </div>

    </div>
  )
}
