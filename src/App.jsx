import { useState, useEffect, useCallback, useRef } from 'react'
import GaugeRing from './components/GaugeRing.jsx'
import HBar from './components/HBar.jsx'
import { fetchMarketData } from './logic/api.js'
import {
  calcEMA, calcRSI, calcATR, calcADX,
  findSwings, calcVolumeTrend,
  calcForecastScore, calcScoreBreakdown,
  getSignal, fgLabel, fgColor
} from './logic/logic.js'

const AUTO_REFRESH_SEC = 60

// ─────────────────────────────────────────────────────────────
// MARKET PHASE — Breakout / Squeeze Detection
// ─────────────────────────────────────────────────────────────
function calcMarketPhase(ind) {
  if (!ind) return null
  const { adx, plusDI, minusDI, price, ema21h4, ema21, volRatio } = ind

  if (adx !== null && adx < 20) {
    return {
      phase: 'squeeze', label: 'ราคากำลังบีบตัว (Squeeze)',
      sublabel: 'พลังงานสะสม รอทิศทาง Breakout', icon: '⚡',
      color: '#c07a30', bg: '#fffbeb', border: '#fde68a', barColor: '#f59e0b',
      strength: Math.round((20 - adx) / 20 * 100),
      detail: `ADX ${adx?.toFixed(1)} < 20 — ตลาดไม่มีทิศทางชัดเจน · ${volRatio < 0.9 ? 'Volume แห้ง ยืนยัน Squeeze' : 'Volume ปกติ'}`,
      hint: 'สภาวะตลาดสะสมพลัง ความผันผวนลดลงและ ADX บ่งบอกถึงสภาวะขาดทิศทาง ราคากำลังบีบตัวในกรอบแคบ แรงซื้อและแรงขายอยู่ในจุดสมดุลชั่วคราว ปริมาณการซื้อขายปกติ แนะนำให้ เฝ้าระวัง และรอการเลือกทางที่ชัดเจน ถ้ามากกว่า 60% ความผันผวนมีโอกาสระเบิดได้ทุกขณะ สิ่งที่ตามมาจะยิ่งรุนแรงและวิ่งได้ไกลมากขึ้นเท่านั้น รอปัจจัยเช่น ข่าวหรือ Volume ก้อนใหญ่',
    }
  }
  if (adx !== null && adx >= 20 && price > ema21h4 && plusDI > minusDI) {
    const strength = Math.min(100, Math.round(
      ((adx - 20) / 40) * 50 + ((plusDI - minusDI) / 30) * 30 + (price > ema21 ? 20 : 0)
    ))
    return {
      phase: 'bullish', label: 'กำลังพุ่งสูงขึ้น (Bullish Breakout)',
      sublabel: 'Trend ขาขึ้น — Momentum แข็ง', icon: '🚀',
      color: '#2d6a4f', bg: '#f0fdf4', border: '#86efac', barColor: '#22c55e',
      strength,
      detail: `ADX ${adx?.toFixed(1)} · +DI ${plusDI?.toFixed(1)} > -DI ${minusDI?.toFixed(1)} · Price > EMA21`,
      hint: adx > 40 ? 'Trend แข็งมาก — ระวัง Overbought' : 'Trend ขาขึ้น — แนวโน้มขาขึ้นรุนแรง โมเมนตัมพุ่งสูงจนเข้าเขตซื้อมากเกินไป (Overbought) มีความเสี่ยงในการย่อตัวระยะสั้น โครงสร้างราคายังคงรักษาทิศทางขาขึ้นได้ดี แรงซื้อมีความต่อเนื่องและมั่นคง',
    }
  }
  if (adx !== null && adx >= 20 && price < ema21h4 && minusDI > plusDI) {
    const strength = Math.min(100, Math.round(
      ((adx - 20) / 40) * 50 + ((minusDI - plusDI) / 30) * 30 + (price < ema21 ? 20 : 0)
    ))
    return {
      phase: 'bearish', label: 'กำลังดิ่งลง (Bearish Breakout)',
      sublabel: 'Trend ขาลง — แรงขายครอบงำ', icon: '📉',
      color: '#9b2226', bg: '#fff1f2', border: '#fca5a5', barColor: '#ef4444',
      strength,
      detail: `ADX ${adx?.toFixed(1)} · -DI ${minusDI?.toFixed(1)} > +DI ${plusDI?.toFixed(1)} · Price < EMA21`,
      hint: adx > 40 ? 'Trend ลงแรงมาก — หลีกเลี่ยงการซื้อ' : 'Trend ขาลง — ระวัง ไม่ควรซื้อ สภาวะตลาดขาลงชัดเจน แรงขายคุมตลาดสมบูรณ์ ราคาหลุดแนวรับสำคัญและยังอยู่ใต้เส้นค่าเฉลี่ย แนะนำให้ชะลอการลงทุนจนกว่าโครงสร้างราคาจะเริ่มยกตัว เพื่อลดความเสี่ยง',
    }
  }
  return {
    phase: 'mixed', label: 'สัญญาณผสม (Transition)',
    sublabel: 'ADX เริ่มแข็ง แต่ทิศทางยังไม่ชัด', icon: '🔄',
    color: '#7b6914', bg: '#fffbeb', border: '#fde68a', barColor: '#f59e0b',
    strength: Math.round((adx ?? 0) / 60 * 100),
    detail: `ADX ${adx?.toFixed(1)} · Price${price > ema21h4 ? ' > ' : ' < '}EMA21 · DI${plusDI > minusDI ? ' Bullish' : ' Bearish'}`,
    hint: 'สัญญาณผสมและผันผวน ช่วงเปลี่ยนผ่านเทรนด์ โมเมนตัมเริ่มเพิ่มขึ้นแต่ทิศทางราคายังขัดแย้งกัน ความเสี่ยงในการเกิดสัญญาณหลอกมีสูง แนะนำให้ ชะลอการตัดสินใจ จนกว่าโครงสร้างราคาและตัวบ่งชี้จะเคลื่อนที่ไปในทิศทางเดียวกัน',
  }
}

// ─────────────────────────────────────────────
// FUTURES POSITION CALCULATOR
// H1 TF · 1 Lot · Leverage 1:200
// ─────────────────────────────────────────────
const LOT_SIZE   = 1
const LEVERAGE   = 200
const MARGIN_PCT = 1 / LEVERAGE

function calcFuturesPosition(ind, score, phase) {
  if (!ind || score === null) return null
  const { price, atr, support, resistance, adx, plusDI, minusDI,
          ema9, ema21, ema21h4, rsi } = ind

  const buySignals = [
    score >= 55, ema9 > ema21, price > ema21h4, plusDI > minusDI,
    adx > 20, rsi > 45 && rsi < 72,
  ]
  const sellSignals = [
    score <= 45, ema9 < ema21, price < ema21h4, minusDI > plusDI,
    adx > 20, rsi < 55 && rsi > 28,
  ]
  const buyCount  = buySignals.filter(Boolean).length
  const sellCount = sellSignals.filter(Boolean).length
  const phaseOk   = phase?.phase === 'bullish' || phase?.phase === 'bearish'

  let direction = 'WAIT', signalCount = 0
  if (phaseOk && buyCount >= 4 && buyCount > sellCount)  { direction = 'BUY';  signalCount = buyCount }
  else if (phaseOk && sellCount >= 4 && sellCount > buyCount) { direction = 'SELL'; signalCount = sellCount }

  const atrVal  = atr ?? (price * 0.008)
  const slDist  = Math.round(atrVal * 1.5 * 100) / 100
  const tp1Dist = Math.round(atrVal * 2.0 * 100) / 100
  const tp2Dist = Math.round(atrVal * 3.5 * 100) / 100

  let entryPrice, slPrice, tp1Price, tp2Price
  if (direction === 'BUY') {
    entryPrice = price; slPrice = Math.max(support - atrVal * 0.3, price - slDist)
    tp1Price = price + tp1Dist; tp2Price = price + tp2Dist
  } else if (direction === 'SELL') {
    entryPrice = price; slPrice = Math.min(resistance + atrVal * 0.3, price + slDist)
    tp1Price = price - tp1Dist; tp2Price = price - tp2Dist
  } else {
    entryPrice = price; slPrice = price - slDist; tp1Price = price + tp1Dist; tp2Price = price + tp2Dist
  }

  const margin      = Math.round(entryPrice * LOT_SIZE / LEVERAGE * 100) / 100
  const slLoss      = Math.round(Math.abs(entryPrice - slPrice) * LOT_SIZE * 100) / 100
  const tp1Profit   = Math.round(Math.abs(tp1Price - entryPrice) * LOT_SIZE * 100) / 100
  const tp2Profit   = Math.round(Math.abs(tp2Price - entryPrice) * LOT_SIZE * 100) / 100
  const riskReward1 = Math.round((tp1Profit / slLoss) * 10) / 10
  const riskReward2 = Math.round((tp2Profit / slLoss) * 10) / 10

  const reasons = direction === 'BUY'
    ? buySignals.map((ok, i) => ({ ok, label: ['Score ≥ 55 (Bullish)', 'EMA9 > EMA21 (Cross ขึ้น)', 'Price > EMA21 H4', '+DI > -DI (แรงซื้อนำ)', 'ADX > 20 (Trend แรง)', 'RSI 45–72 (Momentum ดี)'][i] }))
    : direction === 'SELL'
    ? sellSignals.map((ok, i) => ({ ok, label: ['Score ≤ 45 (Bearish)', 'EMA9 < EMA21 (Cross ลง)', 'Price < EMA21 H4', '-DI > +DI (แรงขายนำ)', 'ADX > 20 (Trend แรง)', 'RSI 28–55 (Momentum ลง)'][i] }))
    : []

  let waitReason = ''
  if (!phaseOk) {
    waitReason = phase?.phase === 'squeeze' ? 'ตลาดอยู่ในสภาวะ Squeeze — ADX < 20 ยังไม่มีทิศทางชัดเจน รอ Breakout' : 'สัญญาณผสม (Transition) — ทิศทางยังขัดแย้ง รอยืนยัน'
  } else if (buyCount < 4 && sellCount < 4) {
    waitReason = `สัญญาณยังไม่ครบ — BUY ${buyCount}/6 · SELL ${sellCount}/6 ต้องการอย่างน้อย 4/6`
  } else if (buyCount === sellCount) { waitReason = 'สัญญาณ BUY และ SELL สมดุลกัน — รอสัญญาณที่ชัดเจนกว่านี้' }

  return { direction, signalCount, totalSignals: 6, entryPrice, slPrice, tp1Price, tp2Price,
    slDist, tp1Dist, tp2Dist, margin, slLoss, tp1Profit, tp2Profit,
    riskReward1, riskReward2, atrVal, reasons, waitReason, buyCount, sellCount }
}

// ─────────────────────────────────────────────────────────────
// SPOT TRADING ADVISOR — ซื้อ/ขาย/รอ พร้อมจุดเข้า-ออก
// Logic: ประเมิน RSI Zone + Price vs EMA + Trend + F&G
// ─────────────────────────────────────────────────────────────
function calcSpotAdvisor(ind, score) {
  if (!ind || score === null) return null

  const { price, rsi, ema21, ema21h4, ema9, adx, plusDI, minusDI,
          support, resistance, atr, fg, pctChange, volRatio, btcChg } = ind

  const atrVal = atr ?? (price * 0.008)

  // ── Zone การประเมิน ────────────────────────────────────────
  // RSI Zone
  const rsiOversold     = rsi < 35            // ราคาถูกเกินจริง (โอกาสซื้อ)
  const rsiNearOversold = rsi >= 35 && rsi < 45 // ใกล้ oversold
  const rsiNeutral      = rsi >= 45 && rsi <= 60
  const rsiNearOverbought = rsi > 60 && rsi <= 72 // ใกล้ overbought
  const rsiOverbought   = rsi > 72             // ราคาแพงเกินจริง (โอกาสขาย)

  // Price vs EMA (ราคาอยู่ไหนเทียบกับเส้น)
  const priceAboveAllEMA   = price > ema9 && price > ema21 && price > ema21h4   // แพงมาก
  const priceBelowAllEMA   = price < ema9 && price < ema21 && price < ema21h4   // ถูกมาก
  const priceMidBull       = price > ema21h4 && price > ema21  // กลางขาขึ้น
  const priceMidBear       = price < ema21h4 && price < ema21  // กลางขาลง

  // Drop / Rise จาก ATH (การลงจากยอดหรือขึ้นจากก้น)
  const bigDrop   = pctChange < -4  // ลงมามากแล้วในรอบนี้
  const bigRise   = pctChange > 4   // ขึ้นมามากแล้วในรอบนี้
  const smallDrop = pctChange < -1.5 && pctChange >= -4
  const smallRise = pctChange > 1.5 && pctChange <= 4

  // Fear & Greed extreme
  const extremeFear  = fg < 25
  const fear         = fg >= 25 && fg < 40
  const greed        = fg > 60 && fg <= 80
  const extremeGreed = fg > 80

  // ── ระดับการประเมิน ─────────────────────────────────────────
  // คะแนน BUY (ต้องการ ≥ 3 จาก 5)
  let buyScore = 0, sellScore = 0
  const buyFactors = [], sellFactors = []

  // RSI ต่ำ = ดีสำหรับซื้อ
  if (rsiOversold)     { buyScore += 2; buyFactors.push({ ok: true,  label: 'RSI < 35 — ราคาถูกเกินจริง (Oversold) โอกาสซื้อสะสม' }) }
  else if (rsiNearOversold) { buyScore += 1; buyFactors.push({ ok: true, label: 'RSI 35–45 — ใกล้ Oversold โอกาสทะยอยสะสม' }) }
  else { buyFactors.push({ ok: false, label: `RSI ${rsi?.toFixed(0)} — ยังไม่อยู่ในโซน Oversold` }) }

  // RSI สูง = ดีสำหรับขาย
  if (rsiOverbought)   { sellScore += 2; sellFactors.push({ ok: true,  label: 'RSI > 72 — ราคาแพงเกินจริง (Overbought) ควรทำกำไร' }) }
  else if (rsiNearOverbought) { sellScore += 1; sellFactors.push({ ok: true, label: 'RSI 60–72 — ใกล้ Overbought ควรเตรียมขายบางส่วน' }) }
  else { sellFactors.push({ ok: false, label: `RSI ${rsi?.toFixed(0)} — ยังไม่อยู่ในโซน Overbought` }) }

  // ราคาต่ำกว่า EMA = โอกาสซื้อ
  if (priceBelowAllEMA) { buyScore += 2; buyFactors.push({ ok: true,  label: 'ราคาต่ำกว่า EMA ทุกเส้น — ราคา Discount ดีสำหรับสะสม' }) }
  else if (priceMidBear){ buyScore += 1; buyFactors.push({ ok: true,  label: 'ราคาต่ำกว่า EMA21 H4 — ยังเป็นโอกาสสะสมในขาลง' }) }
  else { buyFactors.push({ ok: false, label: 'ราคาอยู่เหนือ EMA — ยังไม่ใช่โซน Discount' }) }

  // ราคาสูงกว่า EMA = โอกาสขาย
  if (priceAboveAllEMA) { sellScore += 2; sellFactors.push({ ok: true,  label: 'ราคาเหนือ EMA ทุกเส้น — ราคา Premium ดีสำหรับทำกำไร' }) }
  else if (priceMidBull){ sellScore += 1; sellFactors.push({ ok: true,  label: 'ราคาเหนือ EMA21 H4 — โซน Premium บางส่วน' }) }
  else { sellFactors.push({ ok: false, label: 'ราคาอยู่ใต้ EMA — ยังไม่ใช่โซน Premium' }) }

  // Fear & Greed — contrarian
  if (extremeFear)  { buyScore += 2;  buyFactors.push({ ok: true,  label: 'Fear & Greed Extreme Fear < 25 — ตลาดตื่นกลัวสุดขีด โอกาสสะสมระยะยาว' }) }
  else if (fear)    { buyScore += 1;  buyFactors.push({ ok: true,  label: 'Fear & Greed Fear — ตลาดกังวล มักเป็นโอกาสสะสม' }) }
  else { buyFactors.push({ ok: false, label: `Fear & Greed ${fg} — ไม่อยู่ในโซน Fear` }) }

  if (extremeGreed) { sellScore += 2; sellFactors.push({ ok: true,  label: 'Fear & Greed Extreme Greed > 80 — ตลาดโลภสุดขีด โอกาสทำกำไร' }) }
  else if (greed)   { sellScore += 1; sellFactors.push({ ok: true,  label: 'Fear & Greed Greed — ตลาดโลภ เตรียมทำกำไรบางส่วน' }) }
  else { sellFactors.push({ ok: false, label: `Fear & Greed ${fg} — ไม่อยู่ในโซน Greed` }) }

  // ลงมามาก = โอกาสซื้อ (ไม่ไล่ราคา)
  if (bigDrop)      { buyScore += 1;  buyFactors.push({ ok: true,  label: `ราคาลง ${Math.abs(pctChange?.toFixed(1))}% วันนี้ — ลงมามากแล้ว อย่ากลัวเกินไป` }) }
  else if (smallDrop){ buyScore += 0.5; buyFactors.push({ ok: true, label: `ราคาลง ${Math.abs(pctChange?.toFixed(1))}% — ย่อตัวเล็กน้อย โอกาสสะสม` }) }
  else { buyFactors.push({ ok: false, label: 'ราคาไม่ได้ลงมามาก — อย่าตามซื้อตอนขึ้น (ซื้อหมู)' }) }

  // ขึ้นมามาก = โอกาสขาย (ไม่ถือจนยอด)
  if (bigRise)      { sellScore += 1;  sellFactors.push({ ok: true,  label: `ราคาขึ้น ${pctChange?.toFixed(1)}% วันนี้ — ขึ้นมามากแล้ว ทำกำไรบางส่วน` }) }
  else if (smallRise){ sellScore += 0.5; sellFactors.push({ ok: true, label: `ราคาขึ้น ${pctChange?.toFixed(1)}% — ขึ้นมาพอควร พิจารณาทำกำไร` }) }
  else { sellFactors.push({ ok: false, label: 'ราคาไม่ได้ขึ้นมามาก — อย่ารีบขายหมู' }) }

  // ── ตัดสินใจ ──────────────────────────────────────────────
  // BUY_STRONG: buyScore ≥ 5 (ราคาถูกจริงๆ หลายสัญญาณพร้อมกัน)
  // BUY_WEAK:   buyScore 3–4
  // SELL_STRONG: sellScore ≥ 5
  // SELL_WEAK:  sellScore 3–4
  // WAIT:       ไม่มีสัญญาณชัด
  let action = 'WAIT', actionLabel = '', actionColor = '', actionBg = '', actionBorder = ''
  let mainMsg = '', subMsg = '', warningMsg = ''
  const maxBuyScore = 8, maxSellScore = 8

  if (buyScore >= 5 && buyScore > sellScore) {
    action = 'BUY_STRONG'; actionLabel = '🟢 ราคาต่ำเกินไปแล้ว — ควรซื้อเพื่อสะสม'
    actionColor = '#1a5c38'; actionBg = '#f0fdf4'; actionBorder = '#4ade80'
    mainMsg = `ราคา ETH อยู่ในโซน Discount ที่น่าสะสม หลายปัจจัยชี้ว่าราคาต่ำเกินความเป็นจริง`
    subMsg  = `💡 แนะนำ: ทะยอยซื้อสะสม อย่าใส่ทีเดียวทั้งหมด แบ่งซื้อ 3–5 ครั้ง`
  } else if (buyScore >= 3 && buyScore > sellScore) {
    action = 'BUY_WEAK'; actionLabel = '🟡 ราคาเริ่มน่าสนใจ — พิจารณาทะยอยสะสม'
    actionColor = '#7b6914'; actionBg = '#fffbeb'; actionBorder = '#fde68a'
    mainMsg = `ราคามีสัญญาณน่าสะสมบ้าง แต่ยังไม่ถูกพอ`
    subMsg  = `💡 แนะนำ: ซื้อน้อยๆ ก่อน รอสัญญาณแข็งแกร่งกว่านี้`
  } else if (sellScore >= 5 && sellScore > buyScore) {
    action = 'SELL_STRONG'; actionLabel = '🔴 ราคาสูงเกินไปแล้ว — ควรขายเพื่อทำกำไร'
    actionColor = '#7f1d1d'; actionBg = '#fff1f2'; actionBorder = '#fca5a5'
    mainMsg = `ราคา ETH อยู่ในโซน Premium สัญญาณบ่งชี้ว่าราคาสูงเกินจริง มีความเสี่ยงย่อตัว`
    subMsg  = `💡 แนะนำ: ขายบางส่วนเพื่อทำกำไร อย่าถือจนถึงยอดแล้วค่อยขาย`
  } else if (sellScore >= 3 && sellScore > buyScore) {
    action = 'SELL_WEAK'; actionLabel = '🟡 ราคาเริ่มแพงขึ้น — เตรียมขายทำกำไร'
    actionColor = '#9c4a1a'; actionBg = '#fff3e0'; actionBorder = '#ffcc80'
    mainMsg = `ราคาเริ่มสูงกว่าปกติ แต่ยังไม่แพงสุดขีด`
    subMsg  = `💡 แนะนำ: เตรียมแผนขายบางส่วน รอสัญญาณยืนยัน`
  } else {
    action = 'WAIT'; actionLabel = '⏸️ ยังไม่ควรซื้อหรือขายตอนนี้'
    actionColor = '#4a4035'; actionBg = '#f8f5ef'; actionBorder = '#ddd8cc'
    mainMsg = `ราคาอยู่ในโซนกลาง สัญญาณยังไม่ชัดเจนทั้ง BUY และ SELL`
    subMsg  = `💡 แนะนำ: ถือเงินสดไว้ก่อน รอสัญญาณที่ชัดเจนกว่านี้`
  }

  // ── คำเตือนพิเศษ (ขายหมู / กลัวตกรถ) ────────────────────
  if (rsiOverbought && score < 45) {
    warningMsg = '⚠️ RSI สูงแต่ Trend อ่อน — อย่าซื้อตาม เพราะกลัวตกรถ (FOMO) ราคาอาจย่อต่อ'
  } else if (rsiOversold && score > 55) {
    warningMsg = '⚠️ RSI ต่ำแต่ Trend ยังขึ้น — อย่ารีบขาย นี่คือการย่อตัวในขาขึ้น'
  } else if (bigRise && rsiOverbought) {
    warningMsg = '⚠️ ราคาขึ้นเร็วมาก + RSI Overbought — อย่าซื้อตามตอนนี้ ระวังซื้อหมูที่ยอด!'
  } else if (bigDrop && extremeFear) {
    warningMsg = '⚠️ ราคาลงเร็ว + Extreme Fear — อย่าตื่นตกใจขาย อาจเป็นโอกาสสะสม ไม่ใช่เวลาขายหมู!'
  } else if (buyScore >= 3 && score < 35) {
    warningMsg = '⚠️ RSI ต่ำ แต่ Trend ยังขาลงแรง — ทะยอยสะสมได้ แต่อย่าซื้อหมดทีเดียว'
  }

  // ── ราคาจุดเข้า-ออกที่แนะนำ ──────────────────────────────
  // Zone ซื้อ: support ± ATR
  const buyZoneHigh  = Math.round((support + atrVal * 0.5) * 100) / 100
  const buyZoneLow   = Math.round((support - atrVal * 0.3) * 100) / 100
  // Zone ขาย: resistance ± ATR
  const sellZoneHigh = Math.round((resistance + atrVal * 0.3) * 100) / 100
  const sellZoneLow  = Math.round((resistance - atrVal * 0.5) * 100) / 100
  // TP สำหรับ Spot: ขึ้นไปถึง resistance
  const spotTP1 = Math.round(resistance * 100) / 100
  const spotTP2 = Math.round((resistance + atrVal * 2) * 100) / 100
  // SL Spot: ต่ำกว่า support
  const spotSL  = Math.round((support - atrVal * 0.5) * 100) / 100

  // ราคาปัจจุบัน vs buy/sell zone
  const inBuyZone  = price <= buyZoneHigh && price >= buyZoneLow
  const inSellZone = price >= sellZoneLow && price <= sellZoneHigh
  const pctFromSupport   = ((price - support) / support * 100).toFixed(1)
  const pctFromResistance = ((resistance - price) / price * 100).toFixed(1)

  return {
    action, actionLabel, actionColor, actionBg, actionBorder,
    mainMsg, subMsg, warningMsg,
    buyScore: Math.round(buyScore), maxBuyScore,
    sellScore: Math.round(sellScore), maxSellScore,
    buyFactors, sellFactors,
    buyZoneHigh, buyZoneLow, sellZoneHigh, sellZoneLow,
    spotTP1, spotTP2, spotSL,
    inBuyZone, inSellZone,
    pctFromSupport, pctFromResistance,
    support, resistance,
  }
}

// ─────────────────────────────────────────────
// SPOT ADVISOR CARD COMPONENT
// ─────────────────────────────────────────────
function SpotAdvisorCard({ adv, price, ethThb }) {
  if (!adv) return null
  const [showDetail, setShowDetail] = useState(false)

  const isBuy    = adv.action === 'BUY_STRONG' || adv.action === 'BUY_WEAK'
  const isSell   = adv.action === 'SELL_STRONG' || adv.action === 'SELL_WEAK'
  const isStrong = adv.action === 'BUY_STRONG' || adv.action === 'SELL_STRONG'

  // อัตราแลกเปลี่ยน USD → THB คำนวณจาก ethThb ÷ price (USD)
  const usdToThb = (ethThb && price && price > 0) ? ethThb / price : null

  // fmt: แปลง USD → THB แล้วแสดง ฿ พร้อม comma ไม่มีทศนิยม
  const fmtThb = (usd) => {
    if (usd == null || usdToThb == null) return '—'
    const thb = usd * usdToThb
    return '฿' + thb.toLocaleString('th', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
  }
  // ราคาปัจจุบันเป็น THB
  const priceThb = (price && usdToThb) ? price * usdToThb : null
  const fmtPriceThb = priceThb
    ? '฿' + priceThb.toLocaleString('th', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
    : '—'

  return (
    <div style={{ margin: '8px 16px', background: adv.actionBg, border: `1.5px solid ${adv.actionBorder}`, borderRadius: 16, overflow: 'hidden' }}>

      {/* Header */}
      <div style={{
        background: adv.actionColor, padding: '12px 16px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 22 }}>
            {isBuy ? '🛒' : isSell ? '💰' : '⏸️'}
          </span>
          <div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.8)', fontWeight: 600, letterSpacing: 0.5 }}>
              ตลาด SPOT · ซื้อขายสินทรัพย์จริง · ETH/THB
            </div>
            <div style={{ fontSize: 15, color: '#fff', fontWeight: 900 }}>
              {adv.actionLabel}
            </div>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)' }}>{isBuy ? 'BUY' : isSell ? 'SELL' : 'WAIT'}</div>
          <div style={{ fontSize: 20, fontWeight: 900, color: '#fff' }}>
            {isBuy ? `${adv.buyScore}/${adv.maxBuyScore}` : isSell ? `${adv.sellScore}/${adv.maxSellScore}` : '—'}
          </div>
        </div>
      </div>

      <div style={{ padding: '14px 16px' }}>

        {/* Main message */}
        <div style={{ fontSize: 13, color: adv.actionColor, fontWeight: 700, marginBottom: 4, lineHeight: 1.5 }}>
          {adv.mainMsg}
        </div>
        <div style={{ fontSize: 12, color: '#4a4035', marginBottom: 10, lineHeight: 1.6, padding: '8px 10px', background: 'rgba(0,0,0,0.04)', borderRadius: 8 }}>
          {adv.subMsg}
        </div>

        {/* Warning */}
        {adv.warningMsg && (
          <div style={{ padding: '8px 12px', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 8, marginBottom: 10 }}>
            <div style={{ fontSize: 12, color: '#78350f', fontWeight: 600, lineHeight: 1.6 }}>{adv.warningMsg}</div>
          </div>
        )}

        {/* Price Position Bar */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 11, color: '#a09880', fontWeight: 600 }}>
            <span>🟢 แนวรับ {fmtThb(adv.support)}</span>
            <span>ราคาปัจจุบัน</span>
            <span>🔴 แนวต้าน {fmtThb(adv.resistance)}</span>
          </div>
          {/* Bar showing current price between support and resistance */}
          {(() => {
            const range = adv.resistance - adv.support
            const pct = range > 0 ? Math.min(100, Math.max(0, ((price - adv.support) / range) * 100)) : 50
            const barColor = pct < 30 ? '#16a34a' : pct > 70 ? '#dc2626' : '#f59e0b'
            return (
              <div style={{ position: 'relative', height: 12, background: '#e5e0d8', borderRadius: 6, overflow: 'hidden' }}>
                <div style={{ position: 'absolute', left: 0, top: 0, width: '30%', height: '100%', background: '#d8f3dc', borderRadius: '6px 0 0 6px' }} />
                <div style={{ position: 'absolute', right: 0, top: 0, width: '30%', height: '100%', background: '#fde8e8', borderRadius: '0 6px 6px 0' }} />
                <div style={{ position: 'absolute', left: `${pct}%`, top: '50%', transform: 'translate(-50%, -50%)', width: 16, height: 16, background: barColor, borderRadius: '50%', border: '2px solid #fff', boxShadow: '0 1px 3px rgba(0,0,0,0.3)', zIndex: 2 }} />
              </div>
            )
          })()}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 10, color: '#a09880' }}>
            <span style={{ color: '#16a34a' }}>โซนซื้อสะสม</span>
            <span style={{ fontWeight: 700, color: '#1a1612' }}>{fmtPriceThb}</span>
            <span style={{ color: '#dc2626' }}>โซนขายทำกำไร</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2, fontSize: 10, color: '#a09880' }}>
            <span>+{adv.pctFromSupport}% จากแนวรับ</span>
            <span>{adv.pctFromResistance}% ถึงแนวต้าน</span>
          </div>
        </div>

        {/* Buy / Sell Zone + TP / SL */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
          {/* Buy Zone */}
          <div style={{ background: '#f0fdf4', border: `1.5px solid ${adv.inBuyZone ? '#4ade80' : '#bbf7d0'}`, borderRadius: 10, padding: '10px 12px' }}>
            <div style={{ fontSize: 10, color: '#166534', fontWeight: 700, marginBottom: 4 }}>
              🛒 โซนซื้อสะสม {adv.inBuyZone && <span style={{ background: '#16a34a', color: '#fff', borderRadius: 4, padding: '1px 5px', fontSize: 9 }}>ราคานี้</span>}
            </div>
            <div style={{ fontSize: 12, color: '#15803d', fontWeight: 700 }}>{fmtThb(adv.buyZoneLow)} – {fmtThb(adv.buyZoneHigh)}</div>
            <div style={{ fontSize: 10, color: '#2d6a4f', marginTop: 4, lineHeight: 1.5 }}>
              TP1: {fmtThb(adv.spotTP1)}<br />TP2: {fmtThb(adv.spotTP2)}<br />SL: {fmtThb(adv.spotSL)}
            </div>
          </div>
          {/* Sell Zone */}
          <div style={{ background: '#fff1f2', border: `1.5px solid ${adv.inSellZone ? '#f87171' : '#fca5a5'}`, borderRadius: 10, padding: '10px 12px' }}>
            <div style={{ fontSize: 10, color: '#9b2226', fontWeight: 700, marginBottom: 4 }}>
              💰 โซนขายทำกำไร {adv.inSellZone && <span style={{ background: '#dc2626', color: '#fff', borderRadius: 4, padding: '1px 5px', fontSize: 9 }}>ราคานี้</span>}
            </div>
            <div style={{ fontSize: 12, color: '#b91c1c', fontWeight: 700 }}>{fmtThb(adv.sellZoneLow)} – {fmtThb(adv.sellZoneHigh)}</div>
            <div style={{ fontSize: 10, color: '#9b2226', marginTop: 4, lineHeight: 1.5 }}>
              แนวต้าน Swing High<br />ระวัง Overbought<br />พิจารณาขายบางส่วน
            </div>
          </div>
        </div>

        {/* BUY / SELL Score bars */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <div style={{ flex: 1, background: '#fff', border: '1px solid #bbf7d0', borderRadius: 10, padding: '8px 10px' }}>
            <div style={{ fontSize: 10, color: '#166534', fontWeight: 700, marginBottom: 4 }}>คะแนนสัญญาณ BUY</div>
            <div style={{ height: 6, background: '#e5f7ec', borderRadius: 3, overflow: 'hidden', marginBottom: 3 }}>
              <div style={{ width: `${(adv.buyScore / adv.maxBuyScore) * 100}%`, height: '100%', background: '#16a34a', borderRadius: 3, transition: 'width 0.8s' }} />
            </div>
            <div style={{ fontSize: 13, fontWeight: 800, color: adv.buyScore >= 5 ? '#16a34a' : adv.buyScore >= 3 ? '#c07a30' : '#a09880' }}>
              {adv.buyScore}/{adv.maxBuyScore}
            </div>
          </div>
          <div style={{ flex: 1, background: '#fff', border: '1px solid #fca5a5', borderRadius: 10, padding: '8px 10px' }}>
            <div style={{ fontSize: 10, color: '#9b2226', fontWeight: 700, marginBottom: 4 }}>คะแนนสัญญาณ SELL</div>
            <div style={{ height: 6, background: '#fde8e8', borderRadius: 3, overflow: 'hidden', marginBottom: 3 }}>
              <div style={{ width: `${(adv.sellScore / adv.maxSellScore) * 100}%`, height: '100%', background: '#dc2626', borderRadius: 3, transition: 'width 0.8s' }} />
            </div>
            <div style={{ fontSize: 13, fontWeight: 800, color: adv.sellScore >= 5 ? '#dc2626' : adv.sellScore >= 3 ? '#c07a30' : '#a09880' }}>
              {adv.sellScore}/{adv.maxSellScore}
            </div>
          </div>
        </div>

        {/* Toggle Detail */}
        <button
          onClick={() => setShowDetail(v => !v)}
          style={{ width: '100%', background: 'rgba(0,0,0,0.04)', border: '1px solid #e5e0d8', borderRadius: 8, padding: '6px 12px', fontSize: 11, color: '#7b6914', cursor: 'pointer', fontFamily: 'inherit', marginBottom: showDetail ? 10 : 0 }}
        >
          {showDetail ? '▲ ซ่อนรายละเอียด' : '▼ กดเข้าดูปัจจัยที่ประเมิน'}
        </button>

        {showDetail && (
          <div>
            <div style={{ fontSize: 11, color: '#7b6914', fontWeight: 700, marginBottom: 6 }}>ปัจจัยประเมินการซื้อ (BUY)</div>
            {adv.buyFactors.map((f, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 7, padding: '4px 8px', marginBottom: 3, background: f.ok ? '#f0fdf4' : '#f8f5ef', borderRadius: 6, border: `1px solid ${f.ok ? '#bbf7d0' : '#e5e0d8'}` }}>
                <span style={{ flexShrink: 0, fontSize: 12 }}>{f.ok ? '✅' : '⬜'}</span>
                <span style={{ fontSize: 11, color: f.ok ? '#2d6a4f' : '#a09880', lineHeight: 1.4 }}>{f.label}</span>
              </div>
            ))}
            <div style={{ fontSize: 11, color: '#9b2226', fontWeight: 700, marginTop: 8, marginBottom: 6 }}>ปัจจัยประเมินการขาย (SELL)</div>
            {adv.sellFactors.map((f, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 7, padding: '4px 8px', marginBottom: 3, background: f.ok ? '#fff1f2' : '#f8f5ef', borderRadius: 6, border: `1px solid ${f.ok ? '#fca5a5' : '#e5e0d8'}` }}>
                <span style={{ flexShrink: 0, fontSize: 12 }}>{f.ok ? '🔴' : '⬜'}</span>
                <span style={{ fontSize: 11, color: f.ok ? '#9b2226' : '#a09880', lineHeight: 1.4 }}>{f.label}</span>
              </div>
            ))}
          </div>
        )}

        {/* Disclaimer */}
        <div style={{ fontSize: 10, color: '#a09880', padding: '8px 10px', background: 'rgba(0,0,0,0.03)', borderRadius: 8, lineHeight: 1.6, marginTop: 10 }}>
          ⚠️ หมายเหตุ: คำอธิบาย ดูได้ใน Readme
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// FUTURES POSITION CARD COMPONENT
// ─────────────────────────────────────────────
function FuturesCard({ pos }) {
  if (!pos) return null

  const isBuy  = pos.direction === 'BUY'
  const isSell = pos.direction === 'SELL'
  const isWait = pos.direction === 'WAIT'

  const headerBg   = isBuy ? '#16a34a' : isSell ? '#dc2626' : '#c07a30'
  const cardBg     = isBuy ? '#f0fdf4' : isSell ? '#fff1f2' : '#fffbeb'
  const cardBorder = isBuy ? '#86efac' : isSell ? '#fca5a5' : '#fde68a'
  const accentColor = isBuy ? '#16a34a' : isSell ? '#dc2626' : '#c07a30'

  const fmt = (n) => n?.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  return (
    <div style={{ margin: '8px 16px', background: cardBg, border: `1.5px solid ${cardBorder}`, borderRadius: 16, overflow: 'hidden' }}>
      <div style={{ background: headerBg, padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 20 }}>{isBuy ? '📈' : isSell ? '📉' : '⏸️'}</span>
          <div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', fontWeight: 600 }}>ตลาด FUTURES · สัญญาซื้อขายล่วงหน้า 1:{LEVERAGE}</div>
            <div style={{ fontSize: 15, color: '#fff', fontWeight: 900 }}>
              {isBuy ? '🟢 เปิดออร์เดอร์ BUY' : isSell ? '🔴 เปิดออร์เดอร์ SELL' : '⏳ ยังไม่ควรเปิดออร์เดอร์'}
            </div>
          </div>
        </div>
        {!isWait && (
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)' }}>สัญญาณผ่าน</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: '#fff' }}>{pos.signalCount}/{pos.totalSignals}</div>
          </div>
        )}
      </div>

      <div style={{ padding: '14px 16px' }}>
        {isWait && (
          <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 10, padding: '10px 14px', marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: '#78350f', fontWeight: 700, marginBottom: 4 }}>⚠️ เหตุผลที่ยังไม่เปิด</div>
            <div style={{ fontSize: 12, color: '#92400e', lineHeight: 1.6 }}>{pos.waitReason}</div>
            <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
              <div style={{ flex: 1, textAlign: 'center', padding: '6px 4px', background: '#f0fdf4', borderRadius: 8, border: '1px solid #bbf7d0' }}>
                <div style={{ fontSize: 10, color: '#166534' }}>BUY สัญญาณ</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#16a34a' }}>{pos.buyCount}/6</div>
              </div>
              <div style={{ flex: 1, textAlign: 'center', padding: '6px 4px', background: '#fff1f2', borderRadius: 8, border: '1px solid #fca5a5' }}>
                <div style={{ fontSize: 10, color: '#9b2226' }}>SELL สัญญาณ</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#dc2626' }}>{pos.sellCount}/6</div>
              </div>
            </div>
          </div>
        )}

        {!isWait && (
          <>
            <div style={{ background: '#fff', borderRadius: 10, padding: '10px 14px', marginBottom: 10, border: '1px solid #e5e0d8' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 11, color: '#a09880', fontWeight: 600 }}>ENTRY (Market Order)</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: accentColor }}>${fmt(pos.entryPrice)}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 11, color: '#a09880' }}>Margin ที่ใช้</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#4a4035' }}>${fmt(pos.margin)}</div>
                  <div style={{ fontSize: 10, color: '#b0a898' }}>1 Lot ÷ {LEVERAGE}×</div>
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
              <div style={{ background: '#fff1f2', border: '1px solid #fca5a5', borderRadius: 10, padding: '8px 10px' }}>
                <div style={{ fontSize: 10, color: '#9b2226', fontWeight: 700, marginBottom: 2 }}>🛑 STOP LOSS</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#dc2626' }}>${fmt(pos.slPrice)}</div>
                <div style={{ fontSize: 10, color: '#ef4444', marginTop: 2 }}>{isBuy ? '−' : '+'}{fmt(pos.slDist)} pts</div>
                <div style={{ fontSize: 10, color: '#9b2226', marginTop: 1, fontWeight: 600 }}>ขาดทุน −${fmt(pos.slLoss)}</div>
              </div>
              <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 10, padding: '8px 10px' }}>
                <div style={{ fontSize: 10, color: '#2d6a4f', fontWeight: 700, marginBottom: 2 }}>🎯 TP1</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#16a34a' }}>${fmt(pos.tp1Price)}</div>
                <div style={{ fontSize: 10, color: '#22c55e', marginTop: 2 }}>{isBuy ? '+' : '−'}{fmt(pos.tp1Dist)} pts</div>
                <div style={{ fontSize: 10, color: '#2d6a4f', marginTop: 1, fontWeight: 600 }}>กำไร +${fmt(pos.tp1Profit)}</div>
              </div>
              <div style={{ background: '#f0fdf4', border: '1px solid #4ade80', borderRadius: 10, padding: '8px 10px' }}>
                <div style={{ fontSize: 10, color: '#166534', fontWeight: 700, marginBottom: 2 }}>🎯 TP2</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#15803d' }}>${fmt(pos.tp2Price)}</div>
                <div style={{ fontSize: 10, color: '#16a34a', marginTop: 2 }}>{isBuy ? '+' : '−'}{fmt(pos.tp2Dist)} pts</div>
                <div style={{ fontSize: 10, color: '#166534', marginTop: 1, fontWeight: 600 }}>กำไร +${fmt(pos.tp2Profit)}</div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <div style={{ flex: 1, background: '#fff', border: '1px solid #e5e0d8', borderRadius: 10, padding: '8px 12px', textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: '#a09880', fontWeight: 600 }}>Risk : Reward (TP1)</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: pos.riskReward1 >= 1.5 ? '#16a34a' : '#c07a30' }}>1 : {pos.riskReward1}</div>
              </div>
              <div style={{ flex: 1, background: '#fff', border: '1px solid #e5e0d8', borderRadius: 10, padding: '8px 12px', textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: '#a09880', fontWeight: 600 }}>Risk : Reward (TP2)</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: pos.riskReward2 >= 2 ? '#16a34a' : '#c07a30' }}>1 : {pos.riskReward2}</div>
              </div>
            </div>

            <div style={{ background: 'rgba(0,0,0,0.04)', borderRadius: 8, padding: '7px 12px', marginBottom: 12, fontSize: 11, color: '#6b5e4e', lineHeight: 1.6 }}>
              📐 ATR(14) H1 = ${pos.atrVal?.toFixed(2)} · SL = 1.5× ATR · TP1 = 2.0× ATR · TP2 = 3.5× ATR
            </div>

            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, color: '#a09880', fontWeight: 700, marginBottom: 6 }}>CHECKLIST สัญญาณ {isBuy ? 'BUY' : 'SELL'}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {pos.reasons.map((r, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px', background: r.ok ? '#f0fdf4' : '#f8f5ef', borderRadius: 6, border: `1px solid ${r.ok ? '#bbf7d0' : '#e5e0d8'}` }}>
                    <span style={{ fontSize: 13, flexShrink: 0 }}>{r.ok ? '✅' : '⬜'}</span>
                    <span style={{ fontSize: 11, color: r.ok ? '#2d6a4f' : '#a09880', fontWeight: r.ok ? 600 : 400 }}>{r.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        <div style={{ fontSize: 10, color: '#a09880', padding: '8px 10px', background: 'rgba(0,0,0,0.03)', borderRadius: 8, lineHeight: 1.6, marginTop: 4 }}>
          ⚠️ หมายเหตุ: คำอธิบาย ดูได้ใน Readme
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// calcProb24h
// ─────────────────────────────────────────────
function calcProb24h(score, ind) {
  if (!ind) return 50
  let base = (score - 50) * 0.6 + 50, adj = 0
  if (ind.rsi !== undefined) {
    if (ind.rsi > 65) adj -= 5; else if (ind.rsi < 35) adj += 7
    else if (ind.rsi > 55) adj += 3; else if (ind.rsi < 45) adj -= 3
  }
  if (ind.pctChange !== undefined) {
    if (ind.pctChange > 5) adj -= 4; else if (ind.pctChange > 2) adj += 2
    else if (ind.pctChange < -5) adj += 5; else if (ind.pctChange < -2) adj -= 2
  }
  if (ind.volPct !== undefined) {
    if (ind.volPct > 20 && ind.pctChange > 0) adj += 3
    if (ind.volPct > 20 && ind.pctChange < 0) adj -= 3
  }
  if (ind.btcChg !== undefined) adj += ind.btcChg > 0 ? 2 : -2
  if (ind.fg !== undefined) { if (ind.fg < 20) adj += 4; else if (ind.fg > 75) adj -= 4 }
  if (ind.macroData?.macroScore !== undefined) adj += ind.macroData.macroScore * 0.5
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
  { label: 'XAU/USD (ทองคำ)',  binance: 'PAXGUSDT', isGold: true,   decimals: 2 },
]
async function fetchUSDTHB() {
  try { const r = await fetch('https://api.exchangerate-api.com/v4/latest/USD'); return (await r.json()).rates?.THB ?? 34.5 }
  catch { return 34.5 }
}
function MultiAssetPrices() {
  const [data, setData] = useState([]), [loading, setLoading] = useState(true)
  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const thbRate = await fetchUSDTHB()
        const syms = [...new Set(ASSETS.filter(a => a.binance).map(a => a.binance))]
        const results = await Promise.all(syms.map(s => fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${s}`).then(r => r.json())))
        const pm = {}; syms.forEach((s, i) => { pm[s] = { price: parseFloat(results[i].lastPrice), chg: parseFloat(results[i].priceChangePercent) } })
        const rows = ASSETS.map(a => {
          if (a.isUSDT) return { label: a.label, price: thbRate, chg: null, unit: ' ', decimals: a.decimals }
          const b = pm[a.binance]; if (!b) return null
          return { label: a.label, price: a.thbRate ? b.price * thbRate : b.price, chg: b.chg, unit: !a.thbRate ? '$ ' : ' ', decimals: a.decimals }
        }).filter(Boolean)
        setData(rows)
      } catch (e) { console.error(e) } finally { setLoading(false) }
    }
    load(); const t = setInterval(load, 30000); return () => clearInterval(t)
  }, [])
  if (loading) return <div style={{ textAlign: 'center', color: '#b0a898', fontSize: 13, padding: 12 }}>กำลังโหลดราคา...</div>
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
      {data.map((item, i) => {
        const isN = item.chg === null, up = !isN && item.chg >= 0
        const col = isN ? '#FF69B4' : up ? '#16a34a' : '#dc2626'
        const bg = isN ? '#f8f5ef' : up ? '#f0faf4' : '#fef2f2'
        const bd = isN ? '#ede9e0' : up ? '#bbf7d0' : '#fecaca'
        return (
          <div key={i} style={{ background: bg, border: `1px solid ${bd}`, borderRadius: 10, padding: '10px 12px' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#a09880', marginBottom: 4 }}>{item.label}</div>
            <div style={{ fontSize: item.price > 999999 ? 16 : 18, fontWeight: 800, color: col }}>
              {item.unit}{item.price.toLocaleString('en', { minimumFractionDigits: item.decimals, maximumFractionDigits: item.decimals })}
            </div>
            {!isN && <div style={{ fontSize: 13, fontWeight: 700, color: col, marginTop: 2 }}>{up ? '▲ +' : '▼ '}{Math.abs(item.chg).toFixed(2)}%</div>}
          </div>
        )
      })}
    </div>
  )
}

// ─────────────────────────────────────────────
// SHARED UI
// ─────────────────────────────────────────────
function Card({ children, style = {} }) {
  return <div style={{ background: '#ffffff', borderRadius: 14, margin: '8px 16px', padding: '14px 18px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid #ede9e0', ...style }}>{children}</div>
}
function SecTitle({ children }) {
  return <div style={{ fontSize: 14, fontWeight: 700, color: '#a09880', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 10 }}>{children}</div>
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
        : <span style={{ fontSize: 13, fontWeight: 700, color: valueColor }}>{value}</span>}
    </div>
  )
}
function Countdown({ sec, total }) {
  const r = 10, circ = 2 * Math.PI * r
  return (
    <div style={{ position: 'relative', width: 26, height: 26 }}>
      <svg width={26} height={26} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={13} cy={13} r={r} fill="none" stroke="#e8e5de" strokeWidth="2.5" />
        <circle cx={13} cy={13} r={r} fill="none" stroke="#52b788" strokeWidth="2.5" strokeDasharray={`${(sec / total) * circ} ${circ}`} strokeLinecap="round" />
      </svg>
      <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 700, color: '#52b788' }}>{sec}</span>
    </div>
  )
}

// ─────────────────────────────────────────────
// MARKET PHASE CARD
// ─────────────────────────────────────────────
function MarketPhaseCard({ phase }) {
  if (!phase) return null
  const icons = { squeeze: { l: '📊', r: '⏳' }, bullish: { l: '📈', r: '💪' }, bearish: { l: '📉', r: '⚠️' }, mixed: { l: '🔄', r: '❓' } }
  const ic = icons[phase.phase] || { l: '📊', r: '?' }
  return (
    <div style={{ margin: '8px 16px', background: phase.bg, border: `1.5px solid ${phase.border}`, borderRadius: 14, overflow: 'hidden' }}>
      <div style={{ background: phase.color, padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 20 }}>{ic.l}</span>
          <div>
            <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.8)', fontWeight: 600 }}>MARKET PHASE Confirmation</div>
            <div style={{ fontSize: 14, color: '#fff', fontWeight: 800 }}>{phase.label}</div>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>ความแรง</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#fff', lineHeight: 1 }}>{phase.strength}%</div>
        </div>
      </div>
      <div style={{ padding: '12px 16px' }}>
        <div style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 13, color: phase.color, fontWeight: 700 }}>Breakout ราคาผ่านแนวรับหรือแนวต้านสำคัญ</span>
            <span style={{ fontSize: 13, color: phase.color, fontWeight: 700 }}>{phase.strength}%</span>
          </div>
          <div style={{ height: 8, background: phase.border, borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ width: `${phase.strength}%`, height: '100%', background: phase.barColor, borderRadius: 4, transition: 'width 1s ease' }} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          {[{ key: 'squeeze', label: '🟡 Squeeze' }, { key: 'bullish', label: '🟢 Bullish Breakout' }, { key: 'bearish', label: '🔴 Bearish Breakout' }].map(p => (
            <div key={p.key} style={{ flex: 1, textAlign: 'center', padding: '5px 4px', borderRadius: 8, fontSize: 10, fontWeight: p.key === phase.phase ? 800 : 500, background: p.key === phase.phase ? phase.color : 'rgba(0,0,0,0.04)', color: p.key === phase.phase ? '#fff' : '#a09880', border: p.key === phase.phase ? `1px solid ${phase.color}` : '1px solid #e5e0d8' }}>{p.label}</div>
          ))}
        </div>
        <div style={{ fontSize: 11, color: '#6b5e4e', background: 'rgba(0,0,0,0.04)', borderRadius: 8, padding: '8px 10px', marginBottom: 8, lineHeight: 1.6 }}>{phase.detail}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 10px', background: phase.bg, borderRadius: 8, border: `1px solid ${phase.border}` }}>
          <span style={{ fontSize: 14 }}>{ic.r}</span>
          <span style={{ fontSize: 12, color: phase.color, fontWeight: 700 }}>{phase.hint}</span>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// GOLD MARKET BLOCK
// ส่วน 1: ราคาทองคำวันนี้ (บาททองคำ 96.5%)
// ส่วน 2: Confidence Score คาดการณ์ 24 ชม.
//
// แหล่งข้อมูล:
//   - Binance PAXGUSDT (PAXG ≈ 1 ออนซ์ทองคำ) → XAU/USD
//   - ExchangeRate API → USD/THB
//   - คำนวณราคาบาททองคำ 96.5% จาก XAU/USD × rate × factor
//   - Confidence Score = คำนวณจาก PAXG 24h OHLCV (RSI, trend, volatility)
// ─────────────────────────────────────────────────────────────

// น้ำหนัก 1 บาทไทย = 15.244 กรัม, ทอง 96.5% = 0.965
// 1 ออนซ์ troy = 31.1035 กรัม
// ราคาต่อบาท (THB) = XAU_USD × (15.244 / 31.1035) × 0.965 × USD_THB
const BAHT_GRAM = 15.244      // กรัมต่อบาทไทย
const TROY_OZ   = 31.1035     // กรัมต่อออนซ์ troy
const PURITY    = 0.965       // ความบริสุทธิ์ 96.5%
const MAKING_CHARGE = 600     // ค่ากำเกน (รูปพรรณ) ต่อบาท ประมาณการ
const SPREAD_BAR    = 200     // ส่วนต่างซื้อ-ขาย ทองแท่ง

function calcGoldBahtPrice(xauUsd, usdThb) {
  if (!xauUsd || !usdThb) return null
  // ราคาต่อกรัม USD
  const pricePerGramUsd = xauUsd / TROY_OZ
  // ราคา 1 บาทไทย (15.244g) × ความบริสุทธิ์ 96.5% × อัตราแลกเปลี่ยน
  const pricePerBahtThb = pricePerGramUsd * BAHT_GRAM * PURITY * usdThb

  // ทองแท่ง: ส่วนต่างซื้อ-ขาย ±SPREAD/2
  const barBuy  = Math.round((pricePerBahtThb - SPREAD_BAR / 2) / 50) * 50
  const barSell = Math.round((pricePerBahtThb + SPREAD_BAR / 2) / 50) * 50

  // ทองรูปพรรณ: รับซื้อต่ำกว่า, ขายสูงกว่า (ค่ากำเกน + ค่าแรง)
  const jewelBuy  = Math.round((pricePerBahtThb - MAKING_CHARGE) / 50) * 50
  const jewelSell = Math.round((pricePerBahtThb + MAKING_CHARGE) / 50) * 50

  return { barBuy, barSell, jewelBuy, jewelSell, basePrice: Math.round(pricePerBahtThb) }
}

// Confidence Score คำนวณจาก PAXG OHLCV 24h
// ใช้ข้อมูล: 24h change, volatility (high-low), trend (เทียบ 7d avg)
function calcGoldConfidence(paxgData) {
  if (!paxgData) return { score: 50, level: 'ปานกลาง', direction: 'ทรงตัว', color: '#f59e0b', rangeMin: 0, rangeMax: 0 }

  const { price, change24h, high24h, low24h, priceAvg7d } = paxgData

  let score = 50
  // 1. Trend: ราคาปัจจุบัน vs ค่าเฉลี่ย 7 วัน
  if (priceAvg7d) {
    const trendPct = ((price - priceAvg7d) / priceAvg7d) * 100
    if (trendPct > 1.5)       score += 15
    else if (trendPct > 0.5)  score += 8
    else if (trendPct < -1.5) score -= 15
    else if (trendPct < -0.5) score -= 8
  }

  // 2. Momentum 24h change
  if (change24h > 1.5)       score += 18
  else if (change24h > 0.5)  score += 10
  else if (change24h > 0)    score += 4
  else if (change24h < -1.5) score -= 18
  else if (change24h < -0.5) score -= 10
  else if (change24h < 0)    score -= 4

  // 3. Volatility (range แคบ = ไม่แน่ใจ, range กว้าง + ขึ้น = ดี)
  const rangePct = high24h && low24h ? ((high24h - low24h) / low24h) * 100 : 0
  if (rangePct > 2 && change24h > 0)  score += 10
  else if (rangePct > 2 && change24h < 0) score -= 8
  else if (rangePct < 0.5) score -= 5  // sideways

  score = Math.max(10, Math.min(95, Math.round(score)))

  // ระดับความเชื่อมั่น
  let level = 'ต่ำ', color = '#ef4444'
  if (score >= 75)      { level = 'สูงมาก';  color = '#16a34a' }
  else if (score >= 60) { level = 'สูง';     color = '#22c55e' }
  else if (score >= 45) { level = 'ปานกลาง'; color = '#f59e0b' }
  else if (score >= 30) { level = 'ต่ำ';     color = '#f97316' }
  else                  { level = 'ต่ำมาก';  color = '#ef4444' }

  // ทิศทางคาดการณ์
  let direction = 'ทรงตัว', dirIcon = '→', dirColor = '#f59e0b'
  if (score >= 60)      { direction = 'ขึ้น';   dirIcon = '↑'; dirColor = '#16a34a' }
  else if (score < 40)  { direction = 'ลง';    dirIcon = '↓'; dirColor = '#ef4444' }

  // ช่วงราคาคาดการณ์ 24h (±ATR estimate จาก range 24h)
  const atrEst = high24h && low24h ? (high24h - low24h) * 0.8 : price * 0.005
  const factor = score >= 60 ? 1 : score < 40 ? -0.5 : 0
  const rangeMin = Math.round((price + factor * atrEst * 0.3) * 100) / 100
  const rangeMax = Math.round((price + factor * atrEst * 1.2 + atrEst * 0.2) * 100) / 100

  return { score, level, direction, dirIcon, dirColor, color, rangeMin, rangeMax }
}

// ── Gauge SVG ─────────────────────────────────────────────────
function GoldGauge({ score }) {
  // Half-circle gauge: 180° arc from left to right
  const r = 30, cx = 45, cy = 40
  const circumference = Math.PI * r  // half circle
  const offset = circumference * (1 - score / 100)

  // Color gradient: red(0) → orange(40) → yellow(60) → green(100)
  const getColor = (s) => {
    if (s >= 75) return '#22c55e'
    if (s >= 55) return '#86efac'
    if (s >= 40) return '#f59e0b'
    if (s >= 25) return '#f97316'
    return '#ef4444'
  }
  const needleAngle = -90 + (score / 100) * 180  // -90° to +90°
  const rad = (needleAngle * Math.PI) / 180
  const nx = cx + r * 0.85 * Math.cos(rad)
  const ny = cy + r * 0.85 * Math.sin(rad)

  return (
    <svg width={180} height={100} viewBox="0 0 180 100">
      {/* Background arc segments: red, orange, yellow, green */}
      {[
        { start: 180, end: 225, color: '#ef4444' },
        { start: 225, end: 270, color: '#f97316' },
        { start: 270, end: 315, color: '#f59e0b' },
        { start: 315, end: 360, color: '#22c55e' },
      ].map((seg, i) => {
        const s = (seg.start * Math.PI) / 180
        const e = (seg.end * Math.PI) / 180
        const x1 = cx + r * Math.cos(s), y1 = cy + r * Math.sin(s)
        const x2 = cx + r * Math.cos(e), y2 = cy + r * Math.sin(e)
        const large = seg.end - seg.start > 180 ? 1 : 0
        return (
          <path key={i}
            d={`M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`}
            fill={seg.color} opacity={0.25}
          />
        )
      })}
      {/* Arc track (background) */}
      <path
        d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
        fill="none" stroke="#374151" strokeWidth="5" strokeLinecap="round"
      />
      {/* Arc progress */}
      <path
        d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
        fill="none" stroke={getColor(score)} strokeWidth="5" strokeLinecap="round"
        strokeDasharray={`${(score / 100) * circumference} ${circumference}`}
        style={{ transition: 'stroke-dasharray 1s ease, stroke 0.5s' }}
      />
      {/* Needle */}
      <line x1={cx} y1={cy} x2={nx} y2={ny}
        stroke="#e5e7eb" strokeWidth="1.5" strokeLinecap="round" />
      {/* Center dot */}
      <circle cx={cx} cy={cy} r={5} fill="#9ca3af" />
      {/* Score text */}
      <text x={cx} y={cy + 25} textAnchor="middle"
        fontSize="15" fontWeight="800" fill="#ffffff" fontFamily="inherit">
        {score}%
      </text>
    </svg>
  )
}

// ── Gold Block main component ─────────────────────────────────
function GoldMarketBlock() {
  const [goldData, setGoldData]   = useState(null)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState(null)
  const [lastFetch, setLastFetch] = useState(null)

  useEffect(() => {
    async function fetchGold() {
      setLoading(true)
      setError(null)
      try {
        // ดึง PAXG (≈ 1 troy oz ทองคำ) จาก Binance + USD/THB
        const [paxgRes, usdthbRes, paxg7dRes] = await Promise.all([
          fetch('https://api.binance.com/api/v3/ticker/24hr?symbol=PAXGUSDT'),
          fetch('https://api.exchangerate-api.com/v4/latest/USD'),
          fetch('https://api.binance.com/api/v3/klines?symbol=PAXGUSDT&interval=1d&limit=7'),
        ])

        const paxg   = await paxgRes.json()
        const rates  = await usdthbRes.json()
        const klines = await paxg7dRes.json()

        const price    = parseFloat(paxg.lastPrice)
        const change24h = parseFloat(paxg.priceChangePercent)
        const high24h  = parseFloat(paxg.highPrice)
        const low24h   = parseFloat(paxg.lowPrice)
        const usdThb   = rates?.rates?.THB ?? 34.5

        // ค่าเฉลี่ย 7 วัน (close prices)
        const closes7d = klines.map(k => parseFloat(k[4]))
        const priceAvg7d = closes7d.reduce((a, b) => a + b, 0) / closes7d.length

        const paxgData = { price, change24h, high24h, low24h, priceAvg7d, usdThb }
        const goldPrices = calcGoldBahtPrice(price, usdThb)
        const confidence = calcGoldConfidence(paxgData)

        setGoldData({ price, change24h, high24h, low24h, usdThb, goldPrices, confidence })
        setLastFetch(new Date())
      } catch (e) {
        setError('ดึงข้อมูลทองไม่ได้: ' + e.message)
      } finally {
        setLoading(false)
      }
    }

    fetchGold()
    const t = setInterval(fetchGold, 120000) // refresh ทุก 1 นาที
    return () => clearInterval(t)
  }, [])

  const fmtThb = (n) => n?.toLocaleString('th', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? '—'
  const fmtUsd = (n) => n?.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? '—'

  return (
    <div style={{ margin: '8px 16px', borderRadius: 16, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>

      {/* ── Header ── */}
      <div style={{
        background: 'linear-gradient(135deg, #78350f 0%, #a16207 50%, #ca8a04 100%)',
        padding: '12px 18px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 24 }}>🥇</span>
          <div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', fontWeight: 600, letterSpacing: 1 }}>GOLD MARKET · XAUUSD</div>
            <div style={{ fontSize: 16, color: '#fff', fontWeight: 900 }}>ตลาดทองคำ</div>
          </div>
        </div>
        {!loading && goldData && (
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>PAXG/USD</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#fef08a' }}>${fmtUsd(goldData.price)}</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: goldData.change24h >= 0 ? '#86efac' : '#fca5a5' }}>
              {goldData.change24h >= 0 ? '▲ +' : '▼ '}{Math.abs(goldData.change24h).toFixed(2)}%
            </div>
          </div>
        )}
      </div>

      {/* ── Body ── */}
      <div style={{ background: '#fffbf0', border: '1.5px solid #fde68a', borderTop: 'none', borderRadius: '0 0 16px 16px' }}>

        {loading ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#a16207', fontSize: 13 }}>⟳ กำลังโหลดราคาทองคำ...</div>
        ) : error ? (
          <div style={{ padding: 16, color: '#9b2226', fontSize: 12, textAlign: 'center' }}>{error}</div>
        ) : goldData ? (
          <>
            {/* ── ส่วนที่ 1: ราคาทองคำวันนี้ ── */}
            <div style={{ padding: '14px 16px 10px' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#78350f', marginBottom: 10, letterSpacing: 0.5 }}>
                💛 ราคาทองคำวันนี้ — ความบริสุทธิ์ 96.5%
              </div>

              {/* Table header */}
              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
                background: '#f59e0b', borderRadius: '8px 8px 0 0',
                padding: '7px 10px',
              }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>ประเภท</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#fff', textAlign: 'right' }}>รับซื้อ (฿)</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#fff', textAlign: 'right' }}>ขายออก (฿)</div>
              </div>

              {/* Row: ทองแท่ง */}
              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
                background: '#fff', padding: '10px 10px',
                borderBottom: '1px solid #fde68a',
              }}>
                <div style={{ fontSize: 12, color: '#4a4035', fontWeight: 600 }}>ทองคำแท่ง</div>
                <div style={{ fontSize: 13, color: '#16a34a', fontWeight: 800, textAlign: 'right' }}>
                  {fmtThb(goldData.goldPrices.barBuy)}
                </div>
                <div style={{ fontSize: 13, color: '#dc2626', fontWeight: 800, textAlign: 'right' }}>
                  {fmtThb(goldData.goldPrices.barSell)}
                </div>
              </div>

              {/* Row: ทองรูปพรรณ */}
              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
                background: '#fefce8', padding: '10px 10px',
                borderRadius: '0 0 8px 8px',
              }}>
                <div style={{ fontSize: 12, color: '#4a4035', fontWeight: 600 }}>ทองรูปพรรณ</div>
                <div style={{ fontSize: 13, color: '#16a34a', fontWeight: 800, textAlign: 'right' }}>
                  {fmtThb(goldData.goldPrices.jewelBuy)}
                </div>
                <div style={{ fontSize: 13, color: '#dc2626', fontWeight: 800, textAlign: 'right' }}>
                  {fmtThb(goldData.goldPrices.jewelSell)}
                </div>
              </div>

              {/* Note */}
              <div style={{ fontSize: 11, color: '#a09880', marginTop: 6, lineHeight: 1.5 }}>
                ⚠️ คำนวณจาก PAXG/USD (Binance) × USD/THB × น้ำหนัก 1 บาท 15.244g × 96.5% — เป็นราคาประมาณการ อาจแตกต่างจากราคาร้านทองจริง
              </div>
            </div>

            <div style={{ height: 1, background: '#fde68a', margin: '0 16px' }} />

            {/* ── ส่วนที่ 2: Confidence Score ── */}
            <div style={{ padding: '14px 16px 16px' }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#78350f', marginBottom: 12, letterSpacing: 0.5 }}>
                🎯 คาดการณ์ราคาในอีก 24 ชั่วโมง
              </div>

              <div style={{
                background: '#1f2937',
                borderRadius: 14,
                padding: '14px 16px',
                display: 'flex',
		alignItems: 'center',
		gap: 8,
		justifyContent: 'flex-start',
              }}>
                {/* Gauge */}
                <div style={{ flexShrink: 0 }}>
                  <GoldGauge score={goldData.confidence.score} />
                </div>

                {/* Info */}
                <div style={{ flex: 1 }}>
                  {/* Confidence Level header */}
                  <div style={{
                    flex: 1,
		    display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8,
                    padding: '4px 10px', background: 'rgba(255,255,255,0.08)',
                    borderRadius: 8, width: 'fit-content',
		    marginLeft: -100
                  }}>
                    <span style={{ fontSize: 14 }}>✅</span>
                    <span style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600, letterSpacing: 0.5 }}>Confidence Score</span>
                  </div>
                  <div style={{ fontSize: 13, color: '#d1d5db', lineHeight: 1.6, marginBottom: 10,
		     marginLeft: -100
 		}}>
                    ระดับความเชื่อมั่น :{' '}
                    <span style={{ color: goldData.confidence.color, fontWeight: 800, fontSize: 14 }}>
                      {goldData.confidence.level}
                    </span>
                  </div>

                  <div style={{ fontSize: 12, color: '#9ca3af', lineHeight: 1.6, marginBottom: 10,
		    marginLeft: -100
		 }}>
                    โมเดลการวิเคราะห์ทางเทคนิคและปริมาณการซื้อขายใน 24 ชม.
                  </div>

                  {/* Direction */}
                  <div style={{
                    background: 'rgba(255,255,255,0.06)',
                    borderRadius: 10, padding: '8px 12px',
		    marginLeft: -100,
                  }}>
                    <div style={{ fontSize: 14, color: goldData.confidence.dirColor, fontWeight: 800, marginBottom: 2 }}>
                      {goldData.confidence.dirIcon} คาดการณ์: {goldData.confidence.direction}
                    </div>
                    <div style={{ fontSize: 12, color: '#9ca3af' }}>
                      ${fmtUsd(Math.min(goldData.confidence.rangeMin, goldData.confidence.rangeMax))} –{' '}
                      ${fmtUsd(Math.max(goldData.confidence.rangeMin, goldData.confidence.rangeMax))} USD
                    </div>
                  </div>
                </div>
              </div>

              {/* Sub note */}
              <div style={{ fontSize: 11, color: '#a09880', marginTop: 8, lineHeight: 1.5 }}>
                ⚠️ Confidence Score คำนวณจาก Trend 7 วัน + Momentum 24h + Volatility
              </div>
            </div>

            {/* Last update */}
            {lastFetch && (
              <div style={{ padding: '0 16px 10px', fontSize: 11, color: '#b0a898' }}>
                อัปเดต: {lastFetch.toLocaleTimeString('th-TH')} · รีเฟรชทุก 2 นาที
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// README BLOCK — การแนะนำและคำอธิบาย
// ─────────────────────────────────────────────
const README_ITEMS = [
  {
    num: 1,
    title: 'หัวข้อที่ 1',
    content: 'Text1',
  },
  {
    num: 2,
    title: 'หัวข้อที่ 2',
    content: 'Text2',
  },
  {
    num: 3,
    title: 'RSI/Oversold/Overbought/Swing High/TP/SL',
    content: '⚠️ RSI ถ้าต่ำกว่า 30 คือสภาวะ ขายมากเกินไป หรือ Oversold ให้ระวังแรงซื้อเพื่อสะสม และถ้า RSI อยู่ในโซน 50 เรียกว่าโซนวัดใจ Neutral ราคามักออกข้างหรือ Sideway รอเลือกทาง รอข่าวหรือเหตุการณ์ใหม่ๆ มากระตุ้น และถ้า RSI มากกว่า 70 จะอยู่ในโซน ซื้อมากเกินไป หรือ Overbought ให้ระวังแรงเทขายทำกำไร ⚠️ ขยายความ: TP1/TP2 (Take Profit) คือจุดตั้งขายทำกำไร ส่วน SL (Stop Loss) คือตั้งจุดตัดขาดทุน ⚠️ แนวต้าน Swing High (สวิงไฮ) คือจุดที่ราคาวิ่งขึ้นไปทำ "จุดสูงสุด" ในช่วงเวลาหนึ่ง แล้วเริ่มมีการกลับตัวลดลงมา ทำให้เกิดลักษณะเป็น "ยอดแหลม" หรือ "ภูเขา" บนกราฟ เมื่อจุดนี้เกิดขึ้นแล้ว ในทางเทคนิคเราจะใช้จุดนี้เป็น แนวต้าน สำหรับการวิ่งขึ้นครั้งต่อไป',
  },
  {
    num: 4,
    title: 'ATR Average True Range',
    content: 'อินดิเคเตอร์ทางเทคนิคที่ใช้สำหรับ "วัดความผันผวน" คือค่าเฉลี่ยความแกว่ง ความผันผวนของราคา ระยะการวิ่ง ของราคาในหนึ่งช่วงเวลา เช่นกราฟ 1 ชั่วโมง ราคา มีการวิ่งขึ้นและลงเฉลี่ยอยู่ที่ประมาณกี่ดอลลาร์ ถ้า ATR สูงขึ้น: แปลว่าตลาดกำลัง "ผันผวนรุนแรง" (แท่งเทียนยาวๆ) ถ้า ATR ต่ำลง: แปลว่าตลาดกำลัง "เงียบเหงา" ราคาแกว่งตัวแคบๆ (แท่งเทียนสั้นๆ) ATR ไม่ได้บอก "ทิศทาง" ว่าราคาจะขึ้นหรือลง แต่บอกว่า ปัจจุบันราคาวิ่งแรงแค่ไหน',
  },
  {
    num: 5,
    title: 'Risk-on Risk-off และ Neutral',
    content: 'อธิบาย: Risk-on นักลงทุนมีมุมมองในแง่บวกต่อเศรษฐกิจ เชื่อว่าตลาดจะเติบโต จึงย้ายเงินจากสินทรัพย์ที่ปลอดภัยไปลงทุนในสินทรัพย์ที่ให้ผลตอบแทนสูงกว่า Risk-off ตลาดเต็มไปด้วยความกังวล เช่น มีข่าวสงคราม, ตัวเลขเศรษฐกิจแย่กว่าคาด หรือเงินเฟ้อพุ่งสูง นักลงทุนจะเทขายสินทรัพย์เสี่ยงเพื่อรักษาเงินต้น Neutral หมายถึงสภาวะ สมดุล หรือ "ไร้ทิศทางที่ชัดเจน" ภาวะไม่เลือกข้าง ไม่มีแรงส่ง',
  },
]

function ReadmeBlock() {
  const [openIdx, setOpenIdx] = useState(null)

  const toggle = (i) => setOpenIdx(prev => prev === i ? null : i)

  return (
    <div style={{ margin: '8px 16px' }}>
      {/* Header card */}
      <div style={{
        background: 'linear-gradient(135deg, #1E3A5F 0%, #2d5282 100%)',
        borderRadius: '14px 14px 0 0',
        padding: '14px 18px',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <span style={{ fontSize: 22 }}>📖</span>
        <div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', fontWeight: 600, letterSpacing: 1.2, textTransform: 'uppercase' }}>
            README
          </div>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#ffffff' }}>
            การแนะนำและคำอธิบาย
          </div>
        </div>
      </div>

      {/* Items */}
      <div style={{
        background: '#ffffff',
        border: '1px solid #c7d9f0',
        borderTop: 'none',
        borderRadius: '0 0 14px 14px',
        overflow: 'hidden',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
      }}>
        {README_ITEMS.map((item, i) => {
          const isOpen = openIdx === i
          const isLast = i === README_ITEMS.length - 1

          return (
            <div key={i}>
              {/* Row button */}
              <button
                onClick={() => toggle(i)}
                style={{
                  width: '100%',
                  background: isOpen ? '#eef4fb' : '#ffffff',
                  border: 'none',
                  borderBottom: isLast && !isOpen ? 'none' : '1px solid #ddeaf8',
                  padding: '13px 18px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  textAlign: 'left',
                  transition: 'background 0.15s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {/* Number badge */}
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%',
                    background: isOpen ? '#1E3A5F' : '#ddeaf8',
                    color: isOpen ? '#ffffff' : '#1E3A5F',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 800, flexShrink: 0,
                    transition: 'background 0.2s, color 0.2s',
                  }}>
                    {item.num}
                  </div>
                  <span style={{
                    fontSize: 13, fontWeight: 600,
                    color: isOpen ? '#1E3A5F' : '#3a3028',
                  }}>
                    {item.title}
                  </span>
                </div>
                {/* Chevron */}
                <span style={{
                  fontSize: 12, color: '#6b8aad',
                  transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform 0.2s',
                  display: 'inline-block',
                }}>
                  ▼
                </span>
              </button>

              {/* Content panel */}
              {isOpen && (
                <div style={{
                  padding: '14px 18px 16px 58px',
                  background: '#f5f9ff',
                  borderBottom: isLast ? 'none' : '1px solid #ddeaf8',
                }}>
                  <div style={{
                    fontSize: 15, color: '#2c3e50',
                    lineHeight: 1.8,
                    whiteSpace: 'pre-wrap',
                  }}>
                    {item.content}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// MAIN APP
// ─────────────────────────────────────────────
export default function App() {
  const [loading, setLoading]       = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError]           = useState(null)
  const [ind, setInd]               = useState(null)
  const [score, setScore]           = useState(null)
  const [breakdown, setBreakdown]   = useState(null)
  const [lastUpdate, setLastUpdate] = useState(null)
  const [countdown, setCountdown]   = useState(AUTO_REFRESH_SEC)
  const timerRef = useRef(null), countRef = useRef(null)

  const load = useCallback(async (isRefresh = false) => {
    isRefresh ? setRefreshing(true) : setLoading(true)
    setError(null)
    try {
      const { h1, h4, btcCloses, fg, btcDom, ethThb, fundingLabel, fundingColor, macroData } = await fetchMarketData()
      const closes = h1.map(k => k.c), highs = h1.map(k => k.h)
      const lows = h1.map(k => k.l), vols = h1.map(k => k.v)
      const h4c = h4.map(k => k.c)
      const price = closes[closes.length - 1]
      const price24hAgo = closes[closes.length - 25] ?? closes[0]
      const pctChange = ((price - price24hAgo) / price24hAgo) * 100
      const ema9 = calcEMA(closes.slice(-60), 9), ema21 = calcEMA(closes.slice(-60), 21)
      const ema55 = calcEMA(closes.slice(-60), 55), ema21h4 = calcEMA(h4c, 21)
      const rsi = calcRSI(closes.slice(-30), 14)
      const atr = calcATR(highs.slice(-30), lows.slice(-30), closes.slice(-30), 14)
      const { adx, plusDI, minusDI } = calcADX(highs.slice(-60), lows.slice(-60), closes.slice(-60), 14)
      const { support, resistance } = findSwings(highs, lows, 100, 3)
      const { ratio: volRatio, pct: volPct } = calcVolumeTrend(vols)
      const btcChg = btcCloses.length >= 25
        ? ((btcCloses[btcCloses.length - 1] - btcCloses[btcCloses.length - 25]) / btcCloses[btcCloses.length - 25]) * 100 : 0
      const indicators = { price, pctChange, ema9, ema21, ema55, ema21h4, rsi, atr, adx, plusDI, minusDI, volRatio, volPct, fg, btcChg, btcDom, support, resistance, ethThb, fundingLabel, fundingColor, macroData }
      setInd(indicators)
      setScore(calcForecastScore(indicators))
      setBreakdown(calcScoreBreakdown(indicators))
      setLastUpdate(new Date())
    } catch (e) { setError('โหลดไม่ได้: ' + e.message) }
    finally { setLoading(false); setRefreshing(false) }
  }, [])

  const startTimers = useCallback(() => {
    clearInterval(timerRef.current); clearInterval(countRef.current)
    setCountdown(AUTO_REFRESH_SEC)
    countRef.current = setInterval(() => setCountdown(c => c <= 1 ? AUTO_REFRESH_SEC : c - 1), 1000)
    timerRef.current = setInterval(() => { load(true); setCountdown(AUTO_REFRESH_SEC) }, AUTO_REFRESH_SEC * 1000)
  }, [load])

  useEffect(() => { load().then(startTimers); return () => { clearInterval(timerRef.current); clearInterval(countRef.current) } }, [])
  const handleRefresh = () => { load(true); startTimers() }

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, background: '#f2ede4' }}>
      <div style={{ fontSize: 36, animation: 'spin 1s linear infinite' }}>⟳</div>
      <div style={{ color: '#888', fontSize: 14 }}>กำลังโหลดข้อมูลตลาด ETH...</div>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )

  const sig         = score !== null ? getSignal(score) : null
  const up          = (ind?.pctChange ?? 0) >= 0
  const probUp      = calcProb24h(score ?? 50, ind)
  const probDown    = 100 - probUp
  const marketPhase = calcMarketPhase(ind)
  const futuresPos  = calcFuturesPosition(ind, score, marketPhase)
  const spotAdv     = calcSpotAdvisor(ind, score)  // [NEW]

  const macroSummary = ind?.macroData
    ? `USD ${ind.macroData.usdStatus} · Gold ${ind.macroData.goldStatus} · ${ind.macroData.riskMode}`
    : null

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
            <div style={{ width: 30, height: 30, borderRadius: '50%', background: sig.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0, fontWeight: 700 }}>{sig.icon}</div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 16, color: sig.color }}>{sig.th}</div>
              <div style={{ fontSize: 14, color: sig.color + 'cc', marginTop: 2 }}>{sig.sub}</div>
            </div>
          </div>
        </div>
      )}

      {/* MARKET PHASE */}
      <MarketPhaseCard phase={marketPhase} />

      {/* ── SPOT TRADING ADVISOR (NEW) ── */}
      <SpotAdvisorCard adv={spotAdv} price={ind?.price} ethThb={ind?.ethThb} />

      {/* ── FUTURES POSITION ── */}
      <FuturesCard pos={futuresPos} />

      {/* PREDICTION */}
      <Card>
        <SecTitle>คาดการณ์ราคา ETH ในอีก 24 ช.ม.</SecTitle>
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
          {ind?.macroData && <span> · Macro {ind.macroData.riskMode.split(' ')[0]}</span>}
        </div>
      </Card>

      {/* STATS 3-col */}
      <Card style={{ padding: '12px 8px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr' }}>
          {[
            { label: 'กลัว & โลภ',   value: ind?.fg ?? '—',                   color: fgColor(ind?.fg ?? 50) },
            { label: 'ส่วนแบ่ง BTC', value: `${ind?.btcDom?.toFixed(1)}%`,     color: '#4a4035', border: true },
            { label: 'ผันผวน ATR',   value: `$${ind?.atr?.toFixed(2) ?? '—'}`, color: '#4a4035' },
          ].map((s, i) => (
            <div key={i} style={{ textAlign: 'center', padding: '4px 6px', borderLeft: s.border ? '1px solid #ede9e0' : 'none', borderRight: s.border ? '1px solid #ede9e0' : 'none' }}>
              <div style={{ fontSize: 14, color: '#a09880', fontWeight: 600 }}>{s.label}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: s.color, marginTop: 3 }}>{s.value}</div>
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
          valueColor={(ind?.volPct ?? 0) >= 0 ? '#2d6a4f' : '#c0392b'} last />
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
          valueColor={ind?.fundingColor ?? '#888'} last />
      </Card>

      {/* SUMMARY */}
      <Card>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          {[
            { label: 'Technical', val: breakdown?.tech  ?? '—', ok: breakdown?.techOk },
            { label: 'Sentiment', val: breakdown?.sent  ?? '—', ok: breakdown?.sentOk },
            { label: 'Macro',     val: breakdown?.macro ?? '—', ok: breakdown?.macroOk, sub: breakdown?.macroLabel },
          ].map((item, i) => (
            <div key={i} style={{ flex: 1, textAlign: 'center', padding: '8px 4px', borderRadius: 10, background: item.ok === null ? '#f8f5ef' : item.ok ? '#f0faf4' : '#fdf0f0' }}>
              <div style={{ fontSize: 13, color: '#a09880', fontWeight: 600 }}>{item.label}</div>
              <div style={{ fontSize: 18, fontWeight: 800, marginTop: 2, color: item.ok === null ? '#a09880' : item.ok ? '#2d6a4f' : '#c0392b' }}>{item.val}</div>
              {item.sub && <div style={{ fontSize: 10, color: item.ok ? '#2d6a4f' : '#c0392b', marginTop: 1, fontWeight: 600 }}>{item.sub}</div>}
              <div style={{ fontSize: 13, fontWeight: 700, color: item.ok === null ? '#a09880' : item.ok ? '#52b788' : '#c0392b' }}>
                {item.ok === null ? '—' : item.ok ? '✓' : '✗'}
              </div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 15, color: '#4a4035', lineHeight: 1.8, padding: '10px 14px', background: '#f8f5ef', borderRadius: 10 }}>
          {`กรอบราคาสำคัญที่ต้องจับตา — แนวรับ $${ind?.support?.toFixed(0)} · แนวต้าน $${ind?.resistance?.toFixed(0)}`}
          {macroSummary && (
            <div style={{ fontSize: 15, color: '#7b6914', marginTop: 4, fontWeight: 600 }}>
              🌐 MACRO สภาพแวดล้อมมหาภาค ภาวะตลาดโลก {macroSummary}
            </div>
          )}
          <div style={{ fontSize: 13, color: '#a09880', marginTop: 6 }}>
            ⚠️ หมายเหตุ: คำอธิบาย ดูได้ใน Readme 
          </div>
        </div>
      </Card>

      {/* GOLD MARKET */}
      <GoldMarketBlock />

      {/* README */}
      <ReadmeBlock />

      {/* MULTI-ASSET */}
      <Card>
        <SecTitle>ราคาสินทรัพย์อื่น</SecTitle>
        <MultiAssetPrices />
      </Card>

      {/* REFRESH */}
      <div style={{ margin: '8px 16px 0' }}>
        <button onClick={handleRefresh} disabled={refreshing} style={{ width: '100%', padding: '13px 0', background: '#fff', border: '1.5px solid #ddd8cc', borderRadius: 14, fontSize: 14, color: '#2a2520', cursor: refreshing ? 'not-allowed' : 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, opacity: refreshing ? 0.6 : 1, fontFamily: 'inherit', transition: 'opacity 0.2s' }}>
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
