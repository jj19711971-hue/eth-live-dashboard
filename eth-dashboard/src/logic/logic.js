// ============================================================
//  logic.js — ETH Trading Dashboard · Indicator Engine
//  v2 — Fixed: ADX scoring, Score consistency
// ============================================================

export function calcEMA(prices, period) {
  if (!prices || prices.length < period) return null
  const k = 2 / (period + 1)
  let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period
  for (let i = period; i < prices.length; i++) ema = prices[i] * k + ema * (1 - k)
  return ema
}

export function calcRSI(prices, period = 14) {
  if (!prices || prices.length < period + 1) return null
  let gains = 0, losses = 0
  for (let i = 1; i <= period; i++) {
    const d = prices[i] - prices[i - 1]
    if (d >= 0) gains += d; else losses -= d
  }
  let ag = gains / period, al = losses / period
  for (let i = period + 1; i < prices.length; i++) {
    const d = prices[i] - prices[i - 1]
    ag = (ag * (period - 1) + Math.max(d, 0)) / period
    al = (al * (period - 1) + Math.max(-d, 0)) / period
  }
  return al === 0 ? 100 : 100 - 100 / (1 + ag / al)
}

export function calcATR(highs, lows, closes, period = 14) {
  if (!closes || closes.length < period + 1) return null
  const trs = []
  for (let i = 1; i < closes.length; i++) {
    trs.push(Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    ))
  }
  return trs.slice(-period).reduce((a, b) => a + b, 0) / period
}

export function calcADX(highs, lows, closes, period = 14) {
  if (!closes || closes.length < period * 2) return { adx: null, plusDI: null, minusDI: null }
  const trs = [], pDMs = [], mDMs = []
  for (let i = 1; i < closes.length; i++) {
    trs.push(Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    ))
    const up = highs[i] - highs[i - 1], dn = lows[i - 1] - lows[i]
    pDMs.push(up > dn && up > 0 ? up : 0)
    mDMs.push(dn > up && dn > 0 ? dn : 0)
  }
  const smooth = (arr, p) => {
    let s = arr.slice(0, p).reduce((a, b) => a + b, 0)
    const r = [s]
    for (let i = p; i < arr.length; i++) { s = s - s / p + arr[i]; r.push(s) }
    return r
  }
  const sTR = smooth(trs, period), sPDM = smooth(pDMs, period), sMDM = smooth(mDMs, period)
  const dxArr = sTR.map((tr, i) => {
    const pdi = tr ? (sPDM[i] / tr) * 100 : 0
    const mdi = tr ? (sMDM[i] / tr) * 100 : 0
    return { dx: (pdi + mdi) ? Math.abs(pdi - mdi) / (pdi + mdi) * 100 : 0, pdi, mdi }
  })
  const last = dxArr.slice(-period)
  return {
    adx: last.reduce((a, b) => a + b.dx, 0) / last.length,
    plusDI: dxArr[dxArr.length - 1].pdi,
    minusDI: dxArr[dxArr.length - 1].mdi,
  }
}

// ── FIX #6: Swing S/R จาก pivot points จริง ──────────────────
// หา swing high/low โดยดูว่าแท่งกลางสูง/ต่ำกว่า N แท่งรอบข้าง
export function findSwings(highs, lows, lookback = 50, pivotBars = 3) {
  const n = Math.min(highs.length, lookback)
  const hSlice = highs.slice(-n)
  const lSlice = lows.slice(-n)

  let swingHighs = [], swingLows = []

  for (let i = pivotBars; i < hSlice.length - pivotBars; i++) {
    // Swing High: แท่ง i สูงกว่าทุกแท่งในช่วง pivotBars รอบข้าง
    const isSwingHigh = hSlice.slice(i - pivotBars, i).every(v => v < hSlice[i]) &&
                        hSlice.slice(i + 1, i + pivotBars + 1).every(v => v < hSlice[i])
    // Swing Low: แท่ง i ต่ำกว่าทุกแท่งในช่วง pivotBars รอบข้าง
    const isSwingLow  = lSlice.slice(i - pivotBars, i).every(v => v > lSlice[i]) &&
                        lSlice.slice(i + 1, i + pivotBars + 1).every(v => v > lSlice[i])

    if (isSwingHigh) swingHighs.push(hSlice[i])
    if (isSwingLow)  swingLows.push(lSlice[i])
  }

  // ถ้าหา pivot ไม่ได้ (ข้อมูลน้อยไป) ใช้ max/min เป็น fallback
  const currentPrice = highs[highs.length - 1]
  const resistance = swingHighs.length > 0
    ? Math.min(...swingHighs.filter(h => h >= currentPrice * 0.995)) || Math.max(...swingHighs)
    : Math.max(...hSlice)
  const support = swingLows.length > 0
    ? Math.max(...swingLows.filter(l => l <= currentPrice * 1.005)) || Math.min(...swingLows)
    : Math.min(...lSlice)

  return { resistance, support }
}

export function calcVolumeTrend(volumes) {
  if (!volumes || volumes.length < 20) return { ratio: 1, pct: 0 }
  // FIX: ใช้ 3 candle ล่าสุด vs avg 20 เพื่อให้ responsive กว่า
  const recent = volumes.slice(-3).reduce((a, b) => a + b, 0) / 3
  const avg    = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20
  const ratio  = avg ? recent / avg : 1
  return { ratio, pct: Math.round((ratio - 1) * 100) }
}

// ── FIX #2: ADX ต้องสอดคล้องกับทิศทาง DI ───────────────────
export function calcForecastScore(ind) {
  let s = 50
  const { ema9, ema21, ema55, ema21h4, price, rsi, adx,
          plusDI, minusDI, volRatio, fg, btcChg, btcDom } = ind

  // --- Layer 1: EMA Trend (max ±20)
  if (ema9 && ema21)   s += ema9 > ema21   ? 8  : -6
  if (ema21 && ema55)  s += ema21 > ema55  ? 5  : -4
  if (ema21h4 && price) s += price > ema21h4 ? 7 : -5

  // --- Layer 2: Momentum RSI (max ±8)
  if (rsi) {
    if      (rsi > 50 && rsi < 70) s += 6   // Momentum ดี ไม่ overbought
    else if (rsi >= 70)             s -= 3   // Overbought เริ่มระวัง
    else if (rsi <= 30)             s -= 8   // Oversold ใน downtrend = bearish
    else if (rsi > 30 && rsi <= 45) s -= 3   // Weak momentum
    // rsi 45-50 = neutral, ไม่บวกไม่ลบ
  }

  // --- Layer 3: ADX + DI (max ±10) — FIX: ADX ต้องดู DI ด้วย
  if (adx && plusDI && minusDI) {
    const bullishTrend = plusDI > minusDI
    if (adx > 25) {
      // Trend แรง: บวก/ลบตาม DI
      s += bullishTrend ? 5 : -5
      if (adx > 40) s += bullishTrend ? 3 : -3  // Trend แรงมาก
    } else {
      // Trend อ่อน: DI ยังมีน้ำหนักเล็กน้อย
      s += bullishTrend ? 2 : -2
    }
  } else if (plusDI && minusDI) {
    s += plusDI > minusDI ? 2 : -2
  }

  // --- Layer 4: Volume (max ±5)
  if (volRatio !== undefined) {
    if      (volRatio > 1.5) s += 5   // Volume สูงมาก
    else if (volRatio > 1.2) s += 3
    else if (volRatio < 0.6) s -= 3   // Volume แห้ง
    else if (volRatio < 0.8) s -= 1
  }

  // --- Layer 5: Sentiment (max ±5)
  if (fg !== undefined) {
    if      (fg >= 55 && fg <= 74) s += 4   // Greed ปกติ ดี
    else if (fg >= 75)              s -= 2   // Extreme Greed = เริ่มระวัง
    else if (fg >= 40 && fg < 55)  s += 1   // Neutral-ish
    else if (fg >= 25 && fg < 40)  s -= 3   // Fear
    else if (fg < 25)               s -= 5   // Extreme Fear
  }

  // --- Layer 6: BTC Macro (max ±5)
  if (btcChg !== undefined) s += btcChg > 1 ? 4 : btcChg > 0 ? 2 : btcChg > -1 ? -1 : -3
  if (btcDom !== undefined) s += btcDom < 52 ? 2 : btcDom > 58 ? -2 : 0

  return Math.max(0, Math.min(100, Math.round(s)))
}

// ── Signal label ──────────────────────────────────────────────
export function getSignal(score) {
  if (score >= 70) return {
    th: 'Bullish — ควรพิจารณาซื้อ',
    sub: 'Signal ส่วนใหญ่เป็น Bullish — Trend ขึ้น Momentum แข็ง',
    color: '#2d6a4f', bg: '#d8f3dc', border: '#b7e4c7', icon: '▲'
  }
  if (score >= 55) return {
    th: 'Slightly Bullish — ระวัง',
    sub: 'สัญญาณบวกอ่อน — ควรรอยืนยันเพิ่มเติม',
    color: '#52796f', bg: '#e8f5e9', border: '#c8e6c9', icon: '↗'
  }
  if (score >= 45) return {
    th: 'Neutral — รอสัญญาณ',
    sub: 'ตลาดไม่มีทิศทางชัดเจน — รอ Breakout',
    color: '#7b6914', bg: '#fff9e6', border: '#ffe08a', icon: '→'
  }
  if (score >= 30) return {
    th: 'Slightly Bearish — ระวัง',
    sub: 'สัญญาณลบอ่อน — ควรระวังการซื้อ',
    color: '#9c4a1a', bg: '#fff3e0', border: '#ffcc80', icon: '↘'
  }
  return {
    th: 'Bearish — ควรระวัง',
    sub: 'Signal ส่วนใหญ่เป็น Bearish — ตรวจจังหวะดีกว่านี้',
    color: '#9b2226', bg: '#fde8e8', border: '#f5c2c7', icon: '▼'
  }
}

export function fgLabel(v) {
  if (v >= 75) return 'Extreme Greed'
  if (v >= 55) return 'Greed'
  if (v >= 45) return 'Neutral'
  if (v >= 25) return 'Fear'
  return 'Extreme Fear'
}

export function fgColor(v) {
  if (v >= 60) return '#2d6a4f'
  if (v >= 45) return '#7b6914'
  if (v >= 25) return '#c0392b'
  return '#9b2226'
}

// ── Score breakdown สำหรับแสดง Summary ที่ถูกต้อง ────────────
export function calcScoreBreakdown(ind) {
  const { ema9, ema21, ema55, ema21h4, price, rsi, adx, plusDI, minusDI, fg, btcChg } = ind

  const tech = [
    ema9 && ema21 && ema9 > ema21,           // EMA 9>21
    ema21 && ema55 && ema21 > ema55,          // EMA 21>55
    ema21h4 && price && price > ema21h4,      // H4 filter
    rsi && rsi > 50 && rsi < 70,              // RSI momentum
    adx && plusDI && plusDI > minusDI,        // DI direction
    adx && adx > 25,                          // ADX strength
  ]
  const sent = [
    fg && fg >= 45 && fg < 75,               // F&G ok
    btcChg !== undefined && btcChg > 0,       // BTC leading
    ind.btcDom !== undefined && ind.btcDom < 56, // BTC dom
    ind.volRatio !== undefined && ind.volRatio > 1.0, // Volume ok
  ]

  const techPass = tech.filter(Boolean).length
  const sentPass = sent.filter(Boolean).length

  return {
    tech: `${techPass}/${tech.length}`,
    sent: `${sentPass}/${sent.length}`,
    techOk: techPass >= 4,
    sentOk: sentPass >= 3,
  }
}
