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

const AUTO_REFRESH_SEC = 30

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
const LOT_SIZE  = 1       // 1 Lot ETH/USD (1 ETH)
const LEVERAGE  = 200     // 1:200
const MARGIN_PCT = 1 / LEVERAGE  // 0.5%

function calcFuturesPosition(ind, score, phase) {
  if (!ind || score === null) return null

  const { price, atr, support, resistance, adx, plusDI, minusDI,
          ema9, ema21, ema21h4, rsi, volRatio, macroData } = ind

  // ── เงื่อนไขเปิด BUY ──────────────────────────────────────
  // ต้องผ่านอย่างน้อย 4 ใน 6 เงื่อนไข
  const buySignals = [
    score >= 55,                                  // Forecast score บวก
    ema9 > ema21,                                 // EMA cross bullish
    price > ema21h4,                              // H4 filter ผ่าน
    plusDI > minusDI,                             // DI บวก
    adx > 20,                                     // Trend มีแรง
    rsi > 45 && rsi < 72,                         // RSI momentum ดี ไม่ overbought
  ]
  const buyCount = buySignals.filter(Boolean).length

  // ── เงื่อนไขเปิด SELL ─────────────────────────────────────
  const sellSignals = [
    score <= 45,                                  // Forecast score ลบ
    ema9 < ema21,                                 // EMA cross bearish
    price < ema21h4,                              // H4 filter ลง
    minusDI > plusDI,                             // DI ลบ
    adx > 20,                                     // Trend มีแรง
    rsi < 55 && rsi > 28,                         // RSI momentum ลง ไม่ oversold
  ]
  const sellCount = sellSignals.filter(Boolean).length

  // ── Phase blacklist ────────────────────────────────────────
  // ถ้า Squeeze หรือ Mixed → ยังไม่เปิด
  const phaseOk = phase?.phase === 'bullish' || phase?.phase === 'bearish'

  // ── ตัดสินใจ ──────────────────────────────────────────────
  let direction = 'WAIT'
  let signalCount = 0
  let totalSignals = 6

  if (phaseOk && buyCount >= 4 && buyCount > sellCount) {
    direction = 'BUY'
    signalCount = buyCount
  } else if (phaseOk && sellCount >= 4 && sellCount > buyCount) {
    direction = 'SELL'
    signalCount = sellCount
  }

  // ── ATR-based SL / TP (H1) ────────────────────────────────
  // SL = 1.5 × ATR (หยุดขาดทุน)
  // TP1 = 1.5 × ATR (เป้าหมาย 1:1.5 R:R)
  // TP2 = 3.0 × ATR (เป้าหมาย 1:3.0 R:R)
  const atrVal   = atr ?? (price * 0.008)  // fallback 0.8%
  const slDist   = Math.round(atrVal * 1.5 * 100) / 100
  const tp1Dist  = Math.round(atrVal * 2.0 * 100) / 100
  const tp2Dist  = Math.round(atrVal * 3.5 * 100) / 100

  let entryPrice, slPrice, tp1Price, tp2Price
  if (direction === 'BUY') {
    // Entry: ราคาปัจจุบัน (Market Order)
    // SL: ต่ำกว่า support หรือ entry - slDist
    entryPrice = price
    slPrice    = Math.max(support - atrVal * 0.3, price - slDist)
    tp1Price   = price + tp1Dist
    tp2Price   = price + tp2Dist
  } else if (direction === 'SELL') {
    entryPrice = price
    slPrice    = Math.min(resistance + atrVal * 0.3, price + slDist)
    tp1Price   = price - tp1Dist
    tp2Price   = price - tp2Dist
  } else {
    entryPrice = price
    slPrice    = price - slDist
    tp1Price   = price + tp1Dist
    tp2Price   = price + tp2Dist
  }

  // ── P&L คำนวณ ─────────────────────────────────────────────
  // 1 Lot ETH/USD = 1 ETH
  // Margin = price × LOT_SIZE / LEVERAGE
  const margin      = Math.round(entryPrice * LOT_SIZE / LEVERAGE * 100) / 100
  const slLoss      = Math.round(Math.abs(entryPrice - slPrice) * LOT_SIZE * 100) / 100
  const tp1Profit   = Math.round(Math.abs(tp1Price - entryPrice) * LOT_SIZE * 100) / 100
  const tp2Profit   = Math.round(Math.abs(tp2Price - entryPrice) * LOT_SIZE * 100) / 100
  const riskReward1 = Math.round((tp1Profit / slLoss) * 10) / 10
  const riskReward2 = Math.round((tp2Profit / slLoss) * 10) / 10

  // ── เหตุผล ────────────────────────────────────────────────
  const reasons = direction === 'BUY'
    ? buySignals.map((ok, i) => ({
        ok,
        label: ['Score ≥ 55 (Bullish)', 'EMA9 > EMA21 (Cross ขึ้น)', 'Price > EMA21 H4', '+DI > -DI (แรงซื้อนำ)', 'ADX > 20 (Trend แรง)', 'RSI 45–72 (Momentum ดี)'][i]
      }))
    : direction === 'SELL'
    ? sellSignals.map((ok, i) => ({
        ok,
        label: ['Score ≤ 45 (Bearish)', 'EMA9 < EMA21 (Cross ลง)', 'Price < EMA21 H4', '-DI > +DI (แรงขายนำ)', 'ADX > 20 (Trend แรง)', 'RSI 28–55 (Momentum ลง)'][i]
      }))
    : []

  // ── รายละเอียด Wait ───────────────────────────────────────
  let waitReason = ''
  if (!phaseOk) {
    waitReason = phase?.phase === 'squeeze'
      ? 'ตลาดอยู่ในสภาวะ Squeeze — ADX < 20 ยังไม่มีทิศทางชัดเจน รอ Breakout'
      : 'สัญญาณผสม (Transition) — ทิศทางยังขัดแย้ง รอยืนยัน'
  } else if (buyCount < 4 && sellCount < 4) {
    waitReason = `สัญญาณยังไม่ครบ — BUY ${buyCount}/6 · SELL ${sellCount}/6 ต้องการอย่างน้อย 4/6`
  } else if (buyCount === sellCount) {
    waitReason = 'สัญญาณ BUY และ SELL สมดุลกัน — รอสัญญาณที่ชัดเจนกว่านี้'
  }

  return {
    direction, signalCount, totalSignals,
    entryPrice, slPrice, tp1Price, tp2Price,
    slDist, tp1Dist, tp2Dist,
    margin, slLoss, tp1Profit, tp2Profit,
    riskReward1, riskReward2,
    atrVal, reasons, waitReason,
    buyCount, sellCount,
  }
}

// ─────────────────────────────────────────────
// FUTURES POSITION CARD COMPONENT
// ─────────────────────────────────────────────
function FuturesCard({ pos }) {
  if (!pos) return null

  const isBuy  = pos.direction === 'BUY'
  const isSell = pos.direction === 'SELL'
  const isWait = pos.direction === 'WAIT'

  const headerColor = isBuy  ? '#1a5c38'
    : isSell ? '#7f1d1d'
    : '#4a3f00'
  const headerBg    = isBuy  ? '#16a34a'
    : isSell ? '#dc2626'
    : '#c07a30'
  const cardBg      = isBuy  ? '#f0fdf4'
    : isSell ? '#fff1f2'
    : '#fffbeb'
  const cardBorder  = isBuy  ? '#86efac'
    : isSell ? '#fca5a5'
    : '#fde68a'
  const accentColor = isBuy  ? '#16a34a'
    : isSell ? '#dc2626'
    : '#c07a30'

  const fmt = (n) => n?.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  return (
    <div style={{ margin: '8px 16px', background: cardBg, border: `1.5px solid ${cardBorder}`, borderRadius: 16, overflow: 'hidden' }}>

      {/* ── Header ── */}
      <div style={{ background: headerBg, padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 20 }}>
            {isBuy ? '📈' : isSell ? '📉' : '⏸️'}
          </span>
          <div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', fontWeight: 600, letterSpacing: 0.5 }}>
              FUTURES · H1 · 1 Lot · Leverage 1:{LEVERAGE}
            </div>
            <div style={{ fontSize: 15, color: '#fff', fontWeight: 900, letterSpacing: 0.5 }}>
              {isBuy  ? '🟢 เปิดออร์เดอร์ BUY'
               : isSell ? '🔴 เปิดออร์เดอร์ SELL'
               : '⏳ ยังไม่ควรเปิดออร์เดอร์'}
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

        {/* ── WAIT reason ── */}
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

        {/* ── Entry / SL / TP ── */}
        {!isWait && (
          <>
            {/* Entry price */}
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

            {/* SL / TP Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
              {/* SL */}
              <div style={{ background: '#fff1f2', border: '1px solid #fca5a5', borderRadius: 10, padding: '8px 10px' }}>
                <div style={{ fontSize: 10, color: '#9b2226', fontWeight: 700, marginBottom: 2 }}>🛑 STOP LOSS</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#dc2626' }}>${fmt(pos.slPrice)}</div>
                <div style={{ fontSize: 10, color: '#ef4444', marginTop: 2 }}>
                  {isBuy ? '−' : '+'}{fmt(pos.slDist)} pts
                </div>
                <div style={{ fontSize: 10, color: '#9b2226', marginTop: 1, fontWeight: 600 }}>
                  ขาดทุน −${fmt(pos.slLoss)}
                </div>
              </div>

              {/* TP1 */}
              <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 10, padding: '8px 10px' }}>
                <div style={{ fontSize: 10, color: '#2d6a4f', fontWeight: 700, marginBottom: 2 }}>🎯 TP1</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#16a34a' }}>${fmt(pos.tp1Price)}</div>
                <div style={{ fontSize: 10, color: '#22c55e', marginTop: 2 }}>
                  {isBuy ? '+' : '−'}{fmt(pos.tp1Dist)} pts
                </div>
                <div style={{ fontSize: 10, color: '#2d6a4f', marginTop: 1, fontWeight: 600 }}>
                  กำไร +${fmt(pos.tp1Profit)}
                </div>
              </div>

              {/* TP2 */}
              <div style={{ background: '#f0fdf4', border: '1px solid #4ade80', borderRadius: 10, padding: '8px 10px' }}>
                <div style={{ fontSize: 10, color: '#166534', fontWeight: 700, marginBottom: 2 }}>🎯 TP2</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#15803d' }}>${fmt(pos.tp2Price)}</div>
                <div style={{ fontSize: 10, color: '#16a34a', marginTop: 2 }}>
                  {isBuy ? '+' : '−'}{fmt(pos.tp2Dist)} pts
                </div>
                <div style={{ fontSize: 10, color: '#166534', marginTop: 1, fontWeight: 600 }}>
                  กำไร +${fmt(pos.tp2Profit)}
                </div>
              </div>
            </div>

            {/* R:R Ratio */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <div style={{ flex: 1, background: '#fff', border: '1px solid #e5e0d8', borderRadius: 10, padding: '8px 12px', textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: '#a09880', fontWeight: 600 }}>Risk : Reward (TP1)</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: pos.riskReward1 >= 1.5 ? '#16a34a' : '#c07a30' }}>
                  1 : {pos.riskReward1}
                </div>
              </div>
              <div style={{ flex: 1, background: '#fff', border: '1px solid #e5e0d8', borderRadius: 10, padding: '8px 12px', textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: '#a09880', fontWeight: 600 }}>Risk : Reward (TP2)</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: pos.riskReward2 >= 2 ? '#16a34a' : '#c07a30' }}>
                  1 : {pos.riskReward2}
                </div>
              </div>
            </div>

            {/* ATR info */}
            <div style={{ background: 'rgba(0,0,0,0.04)', borderRadius: 8, padding: '7px 12px', marginBottom: 12, fontSize: 11, color: '#6b5e4e', lineHeight: 1.6 }}>
              📐 ATR(14) H1 = ${pos.atrVal?.toFixed(2)} · SL = 1.5× ATR · TP1 = 2.0× ATR · TP2 = 3.5× ATR
            </div>

            {/* Signal checklist */}
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, color: '#a09880', fontWeight: 700, marginBottom: 6, letterSpacing: 0.5 }}>
                CHECKLIST สัญญาณ {isBuy ? 'BUY' : 'SELL'}
              </div>
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

        {/* ── Disclaimer ── */}
        <div style={{ fontSize: 10, color: '#a09880', padding: '8px 10px', background: 'rgba(0,0,0,0.03)', borderRadius: 8, lineHeight: 1.6, marginTop: 4 }}>
          ⚠️ คำเตือน: การเทรด Futures มีความเสี่ยงสูง ไม่ใช่คำแนะนำการลงทุน
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
  { label: 'XAU/USD',  binance: 'PAXGUSDT', isGold: true,   decimals: 2 },
]
async function fetchUSDTHB() {
  try {
    const r = await fetch('https://api.exchangerate-api.com/v4/latest/USD')
    return (await r.json()).rates?.THB ?? 34.5
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
        const syms    = [...new Set(ASSETS.filter(a => a.binance).map(a => a.binance))]
        const results = await Promise.all(syms.map(s => fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${s}`).then(r => r.json())))
        const pm = {}
        syms.forEach((s, i) => { pm[s] = { price: parseFloat(results[i].lastPrice), chg: parseFloat(results[i].priceChangePercent) } })
        const rows = ASSETS.map(a => {
          if (a.isUSDT) return { label: a.label, price: thbRate, chg: null, unit: ' ', decimals: a.decimals }
          const b = pm[a.binance]; if (!b) return null
          return { label: a.label, price: a.thbRate ? b.price * thbRate : b.price, chg: b.chg, unit: !a.thbRate ? '$ ' : ' ', decimals: a.decimals }
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
        const isN = item.chg === null, up = !isN && item.chg >= 0
        const col = isN ? '#FF69B4' : up ? '#16a34a' : '#dc2626'
        const bg  = isN ? '#f8f5ef' : up ? '#f0faf4' : '#fef2f2'
        const bd  = isN ? '#ede9e0' : up ? '#bbf7d0' : '#fecaca'
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
  const timerRef = useRef(null)
  const countRef = useRef(null)

  const load = useCallback(async (isRefresh = false) => {
    isRefresh ? setRefreshing(true) : setLoading(true)
    setError(null)
    try {
      const { h1, h4, btcCloses, fg, btcDom, ethThb, fundingLabel, fundingColor, macroData } = await fetchMarketData()

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
        macroData,
      }

      setInd(indicators)
      setScore(calcForecastScore(indicators))
      setBreakdown(calcScoreBreakdown(indicators))
      setLastUpdate(new Date())
    } catch (e) {
      setError('โหลดไม่ได้: ' + e.message)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  const startTimers = useCallback(() => {
    clearInterval(timerRef.current)
    clearInterval(countRef.current)
    setCountdown(AUTO_REFRESH_SEC)
    countRef.current = setInterval(() => setCountdown(c => c <= 1 ? AUTO_REFRESH_SEC : c - 1), 1000)
    timerRef.current = setInterval(() => { load(true); setCountdown(AUTO_REFRESH_SEC) }, AUTO_REFRESH_SEC * 1000)
  }, [load])

  useEffect(() => {
    load().then(startTimers)
    return () => { clearInterval(timerRef.current); clearInterval(countRef.current) }
  }, [])

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

      {/* ── FUTURES POSITION ── */}
      <FuturesCard pos={futuresPos} />

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

      {/* SUMMARY */}
      <Card>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          {[
            { label: 'Technical', val: breakdown?.tech   ?? '—', ok: breakdown?.techOk },
            { label: 'Sentiment', val: breakdown?.sent   ?? '—', ok: breakdown?.sentOk },
            { label: 'Macro',     val: breakdown?.macro  ?? '—', ok: breakdown?.macroOk, sub: breakdown?.macroLabel },
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
            ⚠️ อธิบาย: Risk-on นักลงทุนมีมุมมองในแง่บวกต่อเศรษฐกิจ เชื่อว่าตลาดจะเติบโต จึงย้ายเงินจากสินทรัพย์ที่ปลอดภัยไปลงทุนในสินทรัพย์ที่ให้ผลตอบแทนสูงกว่า Risk-off ตลาดเต็มไปด้วยความกังวล เช่น มีข่าวสงคราม, ตัวเลขเศรษฐกิจแย่กว่าคาด หรือเงินเฟ้อพุ่งสูง นักลงทุนจะเทขายสินทรัพย์เสี่ยงเพื่อรักษาเงินต้น
          </div>
        </div>
      </Card>

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
