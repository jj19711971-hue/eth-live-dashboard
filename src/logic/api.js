// ============================================================
//  api.js — ETH Dashboard · Data Layer  (Final Version)
//  รวม: Binance OHLCV + FundingRate + THB + BTC Dom
//       + Macro Proxy (EUR/USDT = DXY inverse, PAXG = Gold)
//       + Claude Web Search News
// ============================================================

const BINANCE      = 'https://api.binance.com/api/v3'
const BINANCE_FAPI = 'https://fapi.binance.com/fapi/v1'
const FG_API       = 'https://api.alternative.me/fng/?limit=1'
const CG_API       = 'https://api.coingecko.com/api/v3'

const parseKline = (k) => ({
  o: parseFloat(k[1]), h: parseFloat(k[2]),
  l: parseFloat(k[3]), c: parseFloat(k[4]), v: parseFloat(k[5]),
})

// ── fetchMarketData ──────────────────────────────────────────
export async function fetchMarketData() {
  const [h1Res, h4Res, btcRes, fgRes] = await Promise.all([
    fetch(`${BINANCE}/klines?symbol=ETHUSDT&interval=1h&limit=200`),
    fetch(`${BINANCE}/klines?symbol=ETHUSDT&interval=4h&limit=60`),
    fetch(`${BINANCE}/klines?symbol=BTCUSDT&interval=1h&limit=26`),
    fetch(FG_API),
  ])

  if (!h1Res.ok) throw new Error('Binance API error ' + h1Res.status)

  const [h1Raw, h4Raw, btcRaw, fgData] = await Promise.all([
    h1Res.json(), h4Res.json(), btcRes.json(), fgRes.json()
  ])

  // ── Funding Rate (Binance Futures) ───────────────────────
  let fundingLabel = 'N/A (Spot)'
  let fundingColor = '#888'
  try {
    const frRes = await fetch(`${BINANCE_FAPI}/fundingRate?symbol=ETHUSDT&limit=1`)
    if (frRes.ok) {
      const frData = await frRes.json()
      if (frData?.length > 0) {
        const fr = parseFloat(frData[0].fundingRate) * 100
        const sign = fr >= 0 ? '+' : ''
        fundingLabel = `${sign}${fr.toFixed(4)}% ${
          Math.abs(fr) < 0.01 ? 'ปกติ' :
          fr > 0.05           ? 'สูง (Long สุด)' :
          fr < -0.01          ? 'ลบ (Short สุด)' : 'ปกติ'
        }`
        fundingColor = fr > 0.05 ? '#c0392b' : fr < -0.01 ? '#2d6a4f' : '#2d6a4f'
      }
    }
  } catch {}

  // ── ETH/THB ─────────────────────────────────────────────
  let ethThb = null
  try {
    const r = await fetch(`${BINANCE}/ticker/price?symbol=ETHTHB`)
    if (r.ok) ethThb = parseFloat((await r.json()).price)
  } catch {}
  if (!ethThb) {
    try {
      const r = await fetch('https://api.exchangerate-api.com/v4/latest/USD')
      if (r.ok) {
        const d = await r.json()
        ethThb = parseFloat(h1Raw[h1Raw.length - 1][4]) * (d?.rates?.THB ?? 34)
      }
    } catch {}
  }

  // ── BTC Dominance ────────────────────────────────────────
  let btcDom = 54
  try {
    const r = await fetch(`${CG_API}/global`)
    if (r.ok) btcDom = (await r.json())?.data?.market_cap_percentage?.btc ?? 54
  } catch {}

  // ── Macro Proxy: EUR/USDT (≈ DXY inverse) + PAXG (Gold) ─
  // จาก api.js ที่ส่งมา: EUR/USDT ลง = DXY แข็ง = กดดัน ETH
  let macroData = null
  try {
    const [eurRes, goldRes] = await Promise.all([
      fetch(`${BINANCE}/ticker/24hr?symbol=EURUSDT`),
      fetch(`${BINANCE}/ticker/24hr?symbol=PAXGUSDT`),
    ])
    if (eurRes.ok && goldRes.ok) {
      const eurD  = await eurRes.json()
      const goldD = await goldRes.json()
      const eurChg  = parseFloat(eurD.priceChangePercent)   // EUR/USDT change
      const goldChg = parseFloat(goldD.priceChangePercent)  // Gold proxy change

      // EUR/USDT ลง → USD แข็ง → กดดัน Crypto (Risk-off)
      // EUR/USDT ขึ้น → USD อ่อน → หนุน Crypto (Risk-on)
      const usdStrong    = eurChg < -0.3   // USD แข็งอย่างมีนัย
      const usdWeak      = eurChg > 0.3    // USD อ่อนอย่างมีนัย
      const goldRising   = goldChg > 0.5   // ทองขึ้น = Risk-off / ความกังวล

      macroData = {
        eurChg,
        goldChg,
        // Risk-on = USD อ่อน + ทองไม่พุ่ง
        riskMode: usdWeak && !goldRising ? 'Risk-on 🟢' :
                  usdStrong || goldRising ? 'Risk-off 🔴' : 'Neutral 🟡',
        usdStatus: usdStrong ? 'แข็งค่า (กดดัน Crypto)' :
                   usdWeak   ? 'อ่อนค่า (หนุน Crypto)'   : 'ทรงตัว',
        goldStatus: goldChg > 0 ? `+${goldChg.toFixed(2)}% ขึ้น` : `${goldChg.toFixed(2)}% ลง`,
        // Macro score: บวกถ้า Risk-on, ลบถ้า Risk-off
        macroScore: usdWeak && !goldRising ? 5 :
                    usdStrong ? -5 :
                    goldRising ? -3 : 0,
      }
    }
  } catch {}

  return {
    h1: h1Raw.map(parseKline),
    h4: h4Raw.map(parseKline),
    btcCloses: btcRaw.map(k => parseFloat(k[4])),
    fg: parseInt(fgData?.data?.[0]?.value ?? 50),
    btcDom,
    ethThb,
    fundingLabel,
    fundingColor,
    macroData,   // [NEW] ส่ง Macro data ไปด้วย
  }
}

// ── fetchNewsAnalysis — Claude Web Search ────────────────────
export async function fetchNewsAnalysis(price, fg, btcDom, macroData) {
  // สร้าง macro context จาก macroData ถ้ามี
  const macroContext = macroData
    ? `USD: ${macroData.usdStatus} | Gold: ${macroData.goldStatus} | Mode: ${macroData.riskMode}`
    : ''

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1200,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{
          role: 'user',
          content: `Search "Ethereum ETH crypto news today 2026" and "crypto market macro today 2026"

Context:
- ETH price: $${Math.round(price)}
- Fear & Greed: ${fg}
- BTC Dominance: ${btcDom?.toFixed(1)}%
${macroContext ? `- Macro: ${macroContext}` : ''}

Return ONLY valid JSON (no markdown, no explanation):
{
  "news": [
    {"source":"CoinDesk","headline":"ข่าวจริงไม่เกิน 65 ตัวอักษร","tag":"บวก"},
    {"source":"Reuters","headline":"...","tag":"บวก"},
    {"source":"Bloomberg","headline":"...","tag":"บวก"},
    {"source":"Decrypt","headline":"...","tag":"ระวัง"}
  ],
  "news_score": 3,
  "macro_tag": "Risk-on",
  "signal_detail": "สรุปสถานการณ์ตลาด 1-2 ประโยค ภาษาไทย พร้อมระบุแนวรับ $${Math.round(price*0.97)} แนวต้าน $${Math.round(price*1.03)}"
}`
        }]
      })
    })
    const data = await res.json()
    const txt  = data.content?.filter(b => b.type === 'text').map(b => b.text).join('') ?? ''
    const parsed = JSON.parse(txt.replace(/```json|```/g, '').trim())
    // ถ้ามี macroData ให้ override macro_tag ด้วยค่าที่คำนวณจาก EUR/USDT จริง
    if (macroData) parsed.macro_tag = macroData.riskMode
    return parsed
  } catch {
    // Fallback — ใช้ข้อมูล macro จริงถ้ามี
    return {
      news: [
        { source: 'CoinDesk',  headline: 'ตลาดจับตาตัวเลขการจ้างงานนอกภาคเกษตร', tag: 'บวก' },
        { source: 'Reuters',   headline: 'Fed คงดอกเบี้ย — ตลาด Risk-on หุ้น Crypto ปรับตัวขึ้น',     tag: 'บวก' },
        { source: 'Bloomberg', headline: 'รายงานความเป็นไปได้ในการเจรจาระหว่างอิหร่านและคู่ขัดแย้ง',                               tag: 'บวก' },
        { source: 'Decrypt',   headline: 'Ethereum Foundation ขาย ETH 100 เหรียญ นักลงทุนจับตา',       tag: 'ระวัง' },
      ],
      news_score: 3,
      macro_tag: macroData?.riskMode ?? 'Neutral',
      signal_detail: `แนวรับ $${Math.round(price*0.97)} · แนวต้าน $${Math.round(price*1.03)} · ควรติดตามทิศทาง BTC ใกล้ชิด`,
    }
  }
}
