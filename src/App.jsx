import { useState, useEffect, useCallback } from 'react'
import GaugeRing from './components/GaugeRing.jsx'
import HBar from './components/HBar.jsx'
import { fetchMarketData, fetchNewsAnalysis } from './logic/api.js'
import {
  calcEMA, calcRSI, calcATR, calcADX,
  findSwings, calcVolumeTrend,
  calcForecastScore, getSignal, fgLabel, fgColor
} from './logic/logic.js'

<<<<<<< HEAD
// ─── Card wrapper ─────────────────────────────────────────────
=======
const AUTO_REFRESH_SEC = 30

// ── Card ─────────────────────────────────────────────────────
>>>>>>> fa29c801e60ab9bc8762c44691daa9db52895bb3
function Card({ children, style = {} }) {
  return (
    <div style={{
      background: '#ffffff', borderRadius: 16,
      margin: '10px 14px', padding: '16px 18px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.07)',
      ...style
    }}>
      {children}
    </div>
  )
}

// ─── Section title ────────────────────────────────────────────
function SectionTitle({ children }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 700, color: '#999',
      letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12
    }}>
      {children}
    </div>
  )
}

// ─── Indicator row ────────────────────────────────────────────
function IndRow({ dotColor, label, value, valueColor, bar, last }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between',
      alignItems: 'center', padding: '9px 0',
      borderBottom: last ? 'none' : '1px solid #f4f4f4'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 120 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor, flexShrink: 0, display: 'inline-block' }} />
        <span style={{ fontSize: 13, color: '#555' }}>{label}</span>
      </div>
      {bar
        ? <div style={{ display: 'flex', alignItems: 'center', flex: 1, marginLeft: 16 }}>
            <HBar value={bar.value} max={bar.max} color={bar.color} />
            <span style={{ fontSize: 13, fontWeight: 600, color: valueColor, minWidth: 38, textAlign: 'right' }}>{value}</span>
          </div>
        : <span style={{ fontSize: 13, fontWeight: 600, color: valueColor }}>{value}</span>
      }
    </div>
  )
}

// ─── News tag ─────────────────────────────────────────────────
function Tag({ label }) {
  const bull = label === 'บวก'
  return (
    <span style={{
      fontSize: 10, padding: '2px 8px', borderRadius: 10, flexShrink: 0,
      background: bull ? '#e8f5e9' : '#fff3e0',
      color: bull ? '#2d6a4f' : '#e65100',
      fontWeight: 600, marginLeft: 6
    }}>
      {label}
    </span>
  )
}

// ─── App ──────────────────────────────────────────────────────
export default function App() {
  const [loading, setLoading]       = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError]           = useState(null)
  const [ind, setInd]               = useState(null)
  const [score, setScore]           = useState(null)
  const [news, setNews]             = useState(null)
  const [newsLoading, setNewsLoading] = useState(false)
  const [lastUpdate, setLastUpdate] = useState(null)

  const load = useCallback(async (isRefresh = false) => {
    isRefresh ? setRefreshing(true) : setLoading(true)
    setError(null)
    try {
      const { h1, h4, btcCloses, fg, btcDom } = await fetchMarketData()

      const closes = h1.map(k => k.c)
      const highs  = h1.map(k => k.h)
      const lows   = h1.map(k => k.l)
      const vols   = h1.map(k => k.v)
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
      const { support, resistance }  = findSwings(highs, lows, 24)
      const { ratio: volRatio, pct: volPct } = calcVolumeTrend(vols)

      const btcChg = ((btcCloses[btcCloses.length - 1] - btcCloses[0]) / btcCloses[0]) * 100

      const indicators = {
        price, pctChange,
        ema9, ema21, ema55, ema21h4,
        rsi, atr, adx, plusDI, minusDI,
        volRatio, volPct,
        fg, btcChg, btcDom,
        support, resistance,
      }

      setInd(indicators)
      setScore(calcForecastScore(indicators))
      setLastUpdate(new Date())

      // Load news async (ไม่ block UI)
      setNewsLoading(true)
      fetchNewsAnalysis(price, fg, btcDom).then(n => {
        setNews(n)
        setNewsLoading(false)
      })
    } catch (e) {
      setError('โหลดข้อมูลไม่ได้: ' + e.message)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

// >>> วางอันใหม่ต่อท้ายตรงนี้ <<<
  useEffect(() => {
    const interval = setInterval(() => {
      load(true);
    }, 30000);
    return () => clearInterval(interval);
  }, [load]);


  // ── Loading screen ─────────────────────────────────────────
  if (loading) return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 14,
      background: '#f0efe8'
    }}>
      <div style={{ fontSize: 36, animation: 'spin 1s linear infinite' }}>⟳</div>
      <div style={{ color: '#888', fontSize: 14 }}>กำลังโหลดข้อมูลตลาด ETH...</div>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )

  const sig = score !== null ? getSignal(score) : null
  const up  = (ind?.pctChange ?? 0) >= 0

  return (
    <div style={{ background: '#f0efe8', minHeight: '100vh', maxWidth: 480, margin: '0 auto', paddingBottom: 32 }}>


      {/* ── 1. HEADER ── */}
      <Card style={{ marginTop: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 15, color: '#1E40AF', marginBottom: 4 }}>ETH / USD — H1 Spot</div>
            <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: -1, color: '#111' }}>
              ${ind?.price?.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div style={{ fontSize: 15, color: up ? '#2d6a4f' : '#c0392b', marginTop: 3, fontWeight: 500 }}>
              {up ? '+' : ''}{ind?.pctChange?.toFixed(1)}% วันนี้
            </div>
          </div>
          <GaugeRing score={score ?? 0} />
        </div>
      </Card>

      {/* ── 2. SIGNAL BANNER ── */}
      {sig && (
        <div style={{
          margin: '0 14px 0', background: sig.bg,
          border: `1px solid ${sig.border}`, borderRadius: 14,
          padding: '12px 16px',
          marginBottom: 0
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 30, height: 30, borderRadius: '50%',
              background: sig.color, color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14, flexShrink: 0
            }}>
              {sig.icon}
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 17, color: sig.color }}>{sig.th}</div>
              <div style={{ fontSize: 15, color: sig.color + 'bb', marginTop: 1 }}>{sig.sub}</div>
            </div>
          </div>
        </div>
      )}

      {/* ── 3. STATS ROW ── */}
      <Card style={{ padding: '14px 8px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr' }}>
          {[
            { label: 'Fear & Greed', value: ind?.fg ?? '—', color: fgColor(ind?.fg) },
            { label: 'BTC Dom.',     value: `${ind?.btcDom?.toFixed(1)}%`, color: '#555', border: true },
            { label: 'ATR (H1)',     value: `$${ind?.atr?.toFixed(2) ?? '—'}`, color: '#555' },
          ].map((s, i) => (
            <div key={i} style={{
              textAlign: 'center', padding: '4px 0',
              borderLeft:  s.border ? '1px solid #f0f0f0' : 'none',
              borderRight: s.border ? '1px solid #f0f0f0' : 'none',
            }}>
              <div style={{ fontSize: 15, color: '#00BFFF' }}>{s.label}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: s.color, marginTop: 2 }}>{s.value}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* ── 4. TECHNICAL INDICATORS ── */}
      <Card>
        <SectionTitle>Technical Indicators</SectionTitle>

        <IndRow dotColor="#52b788" label="EMA 9/21 H1"
          value={ind?.ema9 > ind?.ema21 ? 'Fast > Slow ▲' : 'Fast < Slow ▼'}
          valueColor={ind?.ema9 > ind?.ema21 ? '#2d6a4f' : '#c0392b'} />

        <IndRow dotColor="#52b788" label="EMA H4 Filter"
          value={ind?.price > ind?.ema21h4 ? 'Price > EMA21 ✓' : 'Price < EMA21 ✗'}
          valueColor={ind?.price > ind?.ema21h4 ? '#2d6a4f' : '#c0392b'} />

        <IndRow dotColor="#52b788" label="ADX Strength"
          value={ind?.adx?.toFixed(1) ?? '—'}
          valueColor={ind?.adx > 25 ? '#2d6a4f' : '#888'}
          bar={{ value: ind?.adx ?? 0, max: 60, color: ind?.adx > 25 ? '#52b788' : '#f4a261' }} />

        <IndRow dotColor="#52b788" label="+DI / -DI"
          value={ind?.plusDI > ind?.minusDI ? '+DI > -DI ▲' : '+DI < -DI ▼'}
          valueColor={ind?.plusDI > ind?.minusDI ? '#2d6a4f' : '#c0392b'} />

        <IndRow dotColor="#f4a261" label="RSI (14)"
          value={ind?.rsi?.toFixed(1) ?? '—'}
          valueColor={ind?.rsi > 70 ? '#e63946' : '#888'}
          bar={{ value: ind?.rsi ?? 0, max: 100, color: ind?.rsi > 70 ? '#e63946' : '#f4a261' }} />

        <IndRow dotColor="#52b788" label="Volume Trend"
          value={`${(ind?.volPct ?? 0) >= 0 ? 'เพิ่มขึ้น +' : 'ลดลง '}${ind?.volPct ?? 0}%`}
          valueColor={(ind?.volPct ?? 0) >= 0 ? '#2d6a4f' : '#c0392b'}
          last />
      </Card>

      {/* ── 5. MARKET SENTIMENT ── */}
      <Card>
        <SectionTitle>Market Sentiment</SectionTitle>

        <IndRow dotColor="#52b788" label="Fear & Greed Index"
          value={`${ind?.fg} — ${fgLabel(ind?.fg)}`}
          valueColor={fgColor(ind?.fg)} />

        <IndRow dotColor="#f4a261" label="BTC Correlation"
          value={`BTC ${ind?.btcChg >= 0 ? '+' : ''}${ind?.btcChg?.toFixed(1)}% ${ind?.btcChg >= 0 ? '▲ นำ' : '▼ ลง'}`}
          valueColor={ind?.btcChg >= 0 ? '#2d6a4f' : '#c0392b'} />

        <IndRow dotColor="#f4a261" label="BTC Dominance"
          value={`${ind?.btcDom?.toFixed(1)}% → ${ind?.btcDom > 55 ? 'สูง' : 'ปกติ'}`}
          valueColor="#555" />

        <IndRow dotColor="#52b788" label="Funding Rate"
          value="+0.012% ปกติ" valueColor="#2d6a4f" last />
      </Card>

      {/* ── 6. NEWS ── */}
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <SectionTitle>ข่าว &amp; MACRO 24 ชั่วโมงล่าสุด</SectionTitle>
          {newsLoading && <span style={{ fontSize: 10, color: '#bbb', marginBottom: 12 }}>กำลังโหลด...</span>}
        </div>

        {(news?.news ?? []).map((n, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'flex-start', gap: 8,
            padding: '9px 0',
            borderBottom: i < (news.news.length - 1) ? '1px solid #f4f4f4' : 'none'
          }}>
            <span style={{ fontSize: 11, color: '#aaa', width: 64, flexShrink: 0, paddingTop: 2 }}>{n.source}</span>
            <span style={{ fontSize: 12, color: '#333', flex: 1, lineHeight: 1.5 }}>{n.headline}</span>
            <Tag label={n.tag} />
          </div>
        ))}
      </Card>

      {/* ── 7. SUMMARY ── */}
      <Card>
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          {[
            { label: 'Technical', val: news?.tech_score ?? '—' },
            { label: 'Sentiment', val: news?.sent_score ?? '—' },
            { label: 'News',      val: news?.news_score ?? '—' },
          ].map((item, i) => (
            <div key={i} style={{
              flex: 1, textAlign: 'center', padding: '8px 4px',
              background: '#f8faf8', borderRadius: 10,
            }}>
              <div style={{ fontSize: 15, color: '#00BFFF' }}>{item.label}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#2d6a4f', marginTop: 2 }}>{item.val}</div>
              <div style={{ fontSize: 15, color: '#52b788' }}>✓</div>
            </div>
          ))}
        </div>

        <div style={{
          fontSize: 15, color: '#FF4500', lineHeight: 1.75,
          padding: '10px 14px', background: '#f8f8f6', borderRadius: 10,
        }}>
          {news?.signal_detail
            ?? `Signal — แนวรับ $${ind?.support?.toFixed(0)} แนวต้าน $${ind?.resistance?.toFixed(0)}`}
        </div>
      </Card>

      {/* ── 8. REFRESH ── */}
      <div style={{ margin: '10px 14px 0' }}>
        <button
          onClick={() => load(true)}
          disabled={refreshing}
          style={{
            width: '100%', padding: '14px 0',
            background: '#fff', border: '1.5px solid #e0e0d8',
            borderRadius: 14, fontSize: 14, color: '#333',
            cursor: refreshing ? 'not-allowed' : 'pointer',
            fontWeight: 500, display: 'flex', alignItems: 'center',
            justifyContent: 'center', gap: 8,
            opacity: refreshing ? 0.6 : 1,
            fontFamily: 'inherit',
          }}
        >
          {refreshing ? '⟳ กำลังรีเฟรช...' : 'รีเฟรชข้อมูลและข่าวล่าสุด ↗'}
        </button>

        {lastUpdate && (
          <div style={{ textAlign: 'center', fontSize: 15, color: '#FF8C00', marginTop: 6 }}>
            อัปเดตล่าสุด {lastUpdate.toLocaleTimeString('th-TH')}
          </div>
        )}
        {error && (
          <div style={{ color: '#e63946', fontSize: 11, textAlign: 'center', marginTop: 6 }}>{error}</div>
        )}
      </div>
    </div>
  )
}
