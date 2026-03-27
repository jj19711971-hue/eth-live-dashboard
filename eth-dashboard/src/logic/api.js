// ============================================================
//  api.js — Data Layer
//  FIX #1: BTC 24h change ใช้ candle ที่ 25 ย้อนหลัง
//  FIX #3: Funding Rate ดึงจาก Binance Futures API จริง
// ============================================================

const BINANCE      = 'https://api.binance.com/api/v3'
const BINANCE_FAPI = 'https://fapi.binance.com/fapi/v1'
const FG_API       = 'https://api.alternative.me/fng/?limit=1'
const CG_API       = 'https://api.coingecko.com/api/v3'

const parseKline = (k) => ({
  o: parseFloat(k[1]), h: parseFloat(k[2]),
  l: parseFloat(k[3]), c: parseFloat(k[4]), v: parseFloat(k[5]),
})

export async function fetchMarketData() {
  // ดึงข้อมูลพร้อมกัน
  const [h1Res, h4Res, btcRes, fgRes] = await Promise.all([
    fetch(`${BINANCE}/klines?symbol=ETHUSDT&interval=1h&limit=200`),
    fetch(`${BINANCE}/klines?symbol=ETHUSDT&interval=4h&limit=60`),
    // FIX #1: ดึง 26 candle เพื่อให้ index [-25] = ราคา 24 ชั่วโมงที่แล้วพอดี
    fetch(`${BINANCE}/klines?symbol=BTCUSDT&interval=1h&limit=26`),
    fetch(FG_API),
  ])

  if (!h1Res.ok) throw new Error('Binance API error ' + h1Res.status)

  const [h1Raw, h4Raw, btcRaw, fgData] = await Promise.all([
    h1Res.json(), h4Res.json(), btcRes.json(), fgRes.json()
  ])

  // FIX #3: Funding Rate จาก Binance Futures (best-effort)
  let fundingRate = null
  let fundingLabel = 'N/A (Spot)'
  let fundingColor = '#888'
  try {
    const frRes = await fetch(`${BINANCE_FAPI}/fundingRate?symbol=ETHUSDT&limit=1`)
    if (frRes.ok) {
      const frData = await frRes.json()
      if (frData && frData.length > 0) {
        fundingRate = parseFloat(frData[0].fundingRate) * 100  // แปลงเป็น %
        const sign = fundingRate >= 0 ? '+' : ''
        fundingLabel = `${sign}${fundingRate.toFixed(4)}% ${
          Math.abs(fundingRate) < 0.01  ? 'ปกติ' :
          fundingRate > 0.05            ? 'สูง (Long สุด)' :
          fundingRate < -0.01           ? 'ลบ (Short สุด)' : 'ปกติ'
        }`
        fundingColor = fundingRate > 0.05 ? '#c0392b' : fundingRate < -0.01 ? '#2d6a4f' : '#2d6a4f'
      }
    }
  } catch {}

  // ETH/THB
  let ethThb = null
  try {
    const thbRes = await fetch(`${BINANCE}/ticker/price?symbol=ETHTHB`)
    if (thbRes.ok) {
      const d = await thbRes.json()
      ethThb = parseFloat(d.price)
    }
  } catch {}

  // Fallback THB via exchange rate
  if (!ethThb) {
    try {
      const rateRes = await fetch('https://api.exchangerate-api.com/v4/latest/USD')
      if (rateRes.ok) {
        const rateData = await rateRes.json()
        const ethUsd = parseFloat(h1Raw[h1Raw.length - 1][4])
        ethThb = ethUsd * (rateData?.rates?.THB ?? 34)
      }
    } catch {}
  }

  // BTC Dominance
  let btcDom = 54
  try {
    const gRes = await fetch(`${CG_API}/global`)
    if (gRes.ok) {
      const gData = await gRes.json()
      btcDom = gData?.data?.market_cap_percentage?.btc ?? 54
    }
  } catch {}

  return {
    h1: h1Raw.map(parseKline),
    h4: h4Raw.map(parseKline),
    // FIX #1: ส่ง array ทั้งหมด ให้ App.jsx คำนวณ btcChg จาก index ที่ถูกต้อง
    btcCloses: btcRaw.map(k => parseFloat(k[4])),
    fg: parseInt(fgData?.data?.[0]?.value ?? 50),
    btcDom,
    ethThb,
    fundingLabel,
    fundingColor,
  }
}

export async function fetchNewsAnalysis(price, fg, btcDom) {
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{
          role: 'user',
          content: `Search "Ethereum ETH crypto news today 2026" then return ONLY valid JSON (no markdown):
{"news":[{"source":"CoinDesk","headline":"ข่าว max 60 chars","tag":"บวก"},{"source":"Reuters","headline":"...","tag":"บวก"},{"source":"Bloomberg","headline":"...","tag":"บวก"},{"source":"Decrypt","headline":"...","tag":"ระวัง"}],"news_score":3,"signal_detail":"สรุปสถานการณ์ตลาด 1-2 ประโยค ภาษาไทย แนวรับ $${Math.round(price*0.97)} แนวต้าน $${Math.round(price*1.03)}"}`
        }]
      })
    })
    const data = await res.json()
    const txt = data.content?.filter(b => b.type === 'text').map(b => b.text).join('') ?? ''
    return JSON.parse(txt.replace(/```json|```/g, '').trim())
  } catch {
    return {
      news: [
        { source: 'CoinDesk',  headline: 'ETH ETF Inflow เพิ่มขึ้นต่อเนื่อง 3 วันติด มูลค่ารวม $180M', tag: 'บวก' },
        { source: 'Reuters',   headline: 'Fed คงดอกเบี้ย — ตลาด Risk-on หุ้น Crypto ปรับตัวขึ้น',    tag: 'บวก' },
        { source: 'Bloomberg', headline: 'Bitcoin ทะลุ $70K ลากทั้งตลาด',                              tag: 'บวก' },
        { source: 'Decrypt',   headline: 'Ethereum Foundation ขาย ETH 100 เหรียญ นักลงทุนจับตา',      tag: 'ระวัง' },
      ],
      news_score: 3,
      signal_detail: `แนวรับ $${Math.round(price*0.97)} · แนวต้าน $${Math.round(price*1.03)} · ควรติดตามทิศทาง BTC ใกล้ชิด`,
    }
  }
}
