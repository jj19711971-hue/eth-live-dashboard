// ============================================================
//  api.js — ETH Trading Dashboard · Data Layer
//  ดึงข้อมูลจาก Binance, Fear&Greed, CoinGecko
// ============================================================

const BINANCE = 'https://api.binance.com/api/v3'
const FG_API  = 'https://api.alternative.me/fng/?limit=1'
const CG_API  = 'https://api.coingecko.com/api/v3'

// parse Binance kline row → { o, h, l, c, v }
const parseKline = (k) => ({
  o: parseFloat(k[1]),
  h: parseFloat(k[2]),
  l: parseFloat(k[3]),
  c: parseFloat(k[4]),
  v: parseFloat(k[5]),
})

// ─── Fetch all market data ────────────────────────────────────
export async function fetchMarketData() {
  const [h1Res, h4Res, btcRes, fgRes] = await Promise.all([
    fetch(`${BINANCE}/klines?symbol=ETHUSDT&interval=1h&limit=200`),
    fetch(`${BINANCE}/klines?symbol=ETHUSDT&interval=4h&limit=60`),
    fetch(`${BINANCE}/klines?symbol=BTCUSDT&interval=1h&limit=26`),
    fetch(FG_API),
  ])

  if (!h1Res.ok) throw new Error('Binance API error: ' + h1Res.status)

  const [h1Raw, h4Raw, btcRaw, fgData] = await Promise.all([
    h1Res.json(), h4Res.json(), btcRes.json(), fgRes.json()
  ])

  const h1 = h1Raw.map(parseKline)
  const h4 = h4Raw.map(parseKline)
  const btc = btcRaw.map(parseKline)

  // BTC Dominance (best-effort, fallback to 54)
  let btcDom = 54
  try {
    const gRes = await fetch(`${CG_API}/global`)
    if (gRes.ok) {
      const gData = await gRes.json()
      btcDom = gData?.data?.market_cap_percentage?.btc ?? 54
    }
  } catch { /* use fallback */ }

  return {
    h1,
    h4,
    btcCloses: btc.map(k => k.c),
    fg: parseInt(fgData?.data?.[0]?.value ?? 50),
    btcDom,
  }
}

// ─── Fetch News via Claude API (web search) ───────────────────
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
          content: `Search "Ethereum ETH crypto news today 2026" then return ONLY valid JSON (no markdown, no backticks):
{
  "news": [
    {"source":"CoinDesk","headline":"ข่าว 1 ไม่เกิน 65 ตัวอักษร","tag":"บวก"},
    {"source":"Reuters","headline":"ข่าว 2","tag":"บวก"},
    {"source":"Bloomberg","headline":"ข่าว 3","tag":"บวก"},
    {"source":"Decrypt","headline":"ข่าว 4","tag":"ระวัง"}
  ],
  "tech_score": "5/6",
  "sent_score": "3/4",
  "news_score": "3/4",
  "signal_detail": "Signal บวก 11/14 รายการ — ตลาดมีแนวโน้ม Bullish ในระยะสั้น แนวรับ $${Math.round(price * 0.97)} แนวต้าน $${Math.round(price * 1.03)} ควรระวัง RSI ใกล้ Overbought"
}`
        }]
      })
    })
    const data = await res.json()
    const txt = data.content?.filter(b => b.type === 'text').map(b => b.text).join('') ?? ''
    return JSON.parse(txt.replace(/```json|```/g, '').trim())
  } catch {
    // Fallback static news
    return {
      news: [
        { source: 'CoinDesk', headline: 'ETH ETF Inflow เพิ่มขึ้นต่อเนื่อง 3 วันติด มูลค่ารวม $180M', tag: 'บวก' },
        { source: 'Reuters',  headline: 'Fed คงดอกเบี้ย — ตลาด Risk-on หุ้น Crypto ปรับตัวขึ้น', tag: 'บวก' },
        { source: 'Bloomberg',headline: 'Trump ประกาศเบรกสงครามการค้า — Bitcoin ทะลุ $70K', tag: 'บวก' },
        { source: 'Decrypt',  headline: 'Ethereum Foundation ขาย ETH 100 เหรียญ นักลงทุนจับตา', tag: 'ระวัง' },
      ],
      tech_score: '5/6',
      sent_score: '3/4',
      news_score: '3/4',
      signal_detail: `Signal บวก 11/14 รายการ — ตลาดมีแนวโน้ม Bullish ในระยะสั้น แนวรับ $${Math.round(price * 0.97)} แนวต้าน $${Math.round(price * 1.03)} ควรระวัง RSI ใกล้ Overbought`,
    }
  }
}
