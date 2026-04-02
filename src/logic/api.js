// ============================================================
//  api.js — ETH Dashboard · Data Layer  (Final)
//  ลบ fetchNewsAnalysis ออกทั้งหมด (ไม่ใช้ News section แล้ว)
//  คงไว้: Binance OHLCV + FundingRate + THB + BTC Dom
//         + Macro Proxy (EUR/USDT = DXY inverse, PAXG = Gold)
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
        const fr   = parseFloat(frData[0].fundingRate) * 100
        const sign = fr >= 0 ? '+' : ''
        fundingLabel = `${sign}${fr.toFixed(4)}% ${
          Math.abs(fr) < 0.01 ? 'ปกติ' :
          fr > 0.05            ? 'สูง (Long สุด)' :
          fr < -0.01           ? 'ลบ (Short สุด)' : 'ปกติ'
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

  // ── Macro Proxy: EUR/USDT (DXY inverse) + PAXG (Gold) ───
  // EUR/USDT ลง → USD แข็ง → กดดัน Crypto (Risk-off)
  // EUR/USDT ขึ้น → USD อ่อน → หนุน Crypto (Risk-on)
  // Gold ขึ้นแรง → ความกังวล → Risk-off
  let macroData = null
  try {
    const [eurRes, goldRes] = await Promise.all([
      fetch(`${BINANCE}/ticker/24hr?symbol=EURUSDT`),
      fetch(`${BINANCE}/ticker/24hr?symbol=PAXGUSDT`),
    ])
    if (eurRes.ok && goldRes.ok) {
      const eurD    = await eurRes.json()
      const goldD   = await goldRes.json()
      const eurChg  = parseFloat(eurD.priceChangePercent)
      const goldChg = parseFloat(goldD.priceChangePercent)

      const usdStrong  = eurChg < -0.3
      const usdWeak    = eurChg > 0.3
      const goldRising = goldChg > 0.5

      macroData = {
        eurChg,
        goldChg,
        riskMode:   usdWeak && !goldRising ? 'Risk-on 🟢' :
                    usdStrong || goldRising ? 'Risk-off 🔴' : 'Neutral 🟡',
        usdStatus:  usdStrong ? 'แข็งค่า (กดดัน Crypto)' :
                    usdWeak   ? 'อ่อนค่า (หนุน Crypto)'   : 'ทรงตัว',
        goldStatus: goldChg > 0 ? `+${goldChg.toFixed(2)}% ขึ้น` : `${goldChg.toFixed(2)}% ลดลง`,
        macroScore: usdWeak && !goldRising ? 5 :
                    usdStrong              ? -5 :
                    goldRising             ? -3 : 0,
      }
    }
  } catch {}

  return {
    h1:           h1Raw.map(parseKline),
    h4:           h4Raw.map(parseKline),
    btcCloses:    btcRaw.map(k => parseFloat(k[4])),
    fg:           parseInt(fgData?.data?.[0]?.value ?? 50),
    btcDom,
    ethThb,
    fundingLabel,
    fundingColor,
    macroData,
  }
}
