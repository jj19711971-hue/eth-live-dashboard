// ============================================================
//  logic.js — ETH Trading Dashboard · Indicator Engine
//  แยก Logic ออกจาก UI ทั้งหมด ทดสอบได้อิสระ
// ============================================================

// ─── EMA ─────────────────────────────────────────────────────
export function calcEMA(prices, period) {
  if (!prices || prices.length < period) return null
  const k = 2 / (period + 1)
  let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period
  for (let i = period; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k)
  }
  return ema
}

// ─── RSI ─────────────────────────────────────────────────────
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

// ─── ATR ─────────────────────────────────────────────────────
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

// ─── ADX + DI ────────────────────────────────────────────────
export function calcADX(highs, lows, closes, period = 14) {
  if (!closes || closes.length < period * 2) {
    return { adx: null, plusDI: null, minusDI: null }
  }
  const trs = [], pDMs = [], mDMs = []
  for (let i = 1; i < closes.length; i++) {
    trs.push(Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    ))
    const up = highs[i] - highs[i - 1]
    const dn = lows[i - 1] - lows[i]
    pDMs.push(up > dn && up > 0 ? up : 0)
    mDMs.push(dn > up && dn > 0 ? dn : 0)
  }
  const smooth = (arr, p) => {
    let s = arr.slice(0, p).reduce((a, b) => a + b, 0)
    const r = [s]
    for (let i = p; i < arr.length; i++) { s = s - s / p + arr[i]; r.push(s) }
    return r
  }
  const sTR = smooth(trs, period)
  const sPDM = smooth(pDMs, period)
  const sMDM = smooth(mDMs, period)
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

// ─── Swing Support / Resistance ──────────────────────────────
export function findSwings(highs, lows, lookback = 24) {
  const h = highs.slice(-lookback)
  const l = lows.slice(-lookback)
  return {
    resistance: Math.max(...h),
    support: Math.min(...l),
  }
}

// ─── Volume Trend ────────────────────────────────────────────
export function calcVolumeTrend(volumes) {
  if (!volumes || volumes.length < 20) return { ratio: 1, pct: 0 }
  const recent = volumes.slice(-6).reduce((a, b) => a + b, 0) / 6
  const avg = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20
  const ratio = avg ? recent / avg : 1
  return { ratio, pct: Math.round((ratio - 1) * 100) }
}

// ─── Forecast Score (0–100) ──────────────────────────────────
export function calcForecastScore(ind) {
  let s = 50
  const { ema9, ema21, ema55, ema21h4, price, rsi, adx,
          plusDI, minusDI, volRatio, fg, btcChg, btcDom } = ind

  // EMA Trend
  if (ema9 && ema21) s += ema9 > ema21 ? 8 : -6
  if (ema21 && ema55) s += ema21 > ema55 ? 5 : -4
  if (ema21h4 && price) s += price > ema21h4 ? 7 : -5

  // Momentum
  if (rsi) {
    if (rsi > 50 && rsi < 70) s += 6
    else if (rsi >= 70) s -= 3
    else if (rsi < 40) s -= 8
  }

  // Trend Strength
  if (adx) { if (adx > 25) s += 5; if (adx > 40) s += 3 }
  if (plusDI && minusDI) s += plusDI > minusDI ? 5 : -4

  // Volume
  if (volRatio) s += volRatio > 1.2 ? 5 : volRatio < 0.8 ? -3 : 0

  // Sentiment
  if (fg) {
    if (fg >= 55 && fg <= 75) s += 4
    else if (fg > 75) s -= 2
    else if (fg < 40) s -= 5
  }

  // BTC Macro
  if (btcChg !== undefined) s += btcChg > 0 ? 4 : -3
  if (btcDom) s += btcDom < 55 ? 2 : -2

  return Math.max(0, Math.min(100, Math.round(s)))
}

// ─── Signal label จาก Score ──────────────────────────────────
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
    sub: 'Signal ส่วนใหญ่เป็น Bearish — ควรรอจังหวะดีกว่านี้',
    color: '#9b2226', bg: '#fde8e8', border: '#f5c2c7', icon: '▼'
  }
}

// ─── Fear & Greed label ───────────────────────────────────────
export function fgLabel(v) {
  if (v >= 75) return 'Extreme Greed'
  if (v >= 55) return 'Greed'
  if (v >= 45) return 'Neutral'
  if (v >= 25) return 'Fear'
  return 'Extreme Fear'
}

export function fgColor(v) {
  if (v >= 55) return '#2d6a4f'
  if (v >= 45) return '#888'
  return '#c0392b'
}
