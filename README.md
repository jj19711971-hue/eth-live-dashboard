# ETH Trading Dashboard 📊

Web App สำหรับวิเคราะห์ ETH Spot Trading แบบ Real-time

---

## โครงสร้างไฟล์

```
eth-dashboard/
├── index.html              ← Entry HTML
├── package.json            ← Dependencies
├── vite.config.js          ← Vite config (port 3000)
├── src/
│   ├── main.jsx            ← React entry point
│   ├── App.jsx             ← UI หลัก (Dashboard)
│   ├── logic/
│   │   ├── logic.js        ← คำนวณ EMA, RSI, ADX, ATR, Score
│   │   └── api.js          ← ดึงข้อมูล Binance + FearGreed + News
│   └── components/
│       ├── GaugeRing.jsx   ← วงกลม Forecast Score
│       └── HBar.jsx        ← Progress bar (ADX/RSI)
```

---

## วิธีติดตั้งและรัน

### ขั้นตอนที่ 1 — เข้าไปในโฟลเดอร์
```bash
cd eth-dashboard
```

### ขั้นตอนที่ 2 — ติดตั้ง Dependencies
```bash
npm install
```

### ขั้นตอนที่ 3 — รัน Dev Server
```bash
npm run dev
```

เปิด Browser ที่ → **http://localhost:3000**

---

## Data Sources

| แหล่งข้อมูล | ข้อมูลที่ดึง |
|---|---|
| Binance API | ETH OHLCV 1h/4h, BTC 1h |
| alternative.me | Fear & Greed Index |
| CoinGecko | BTC Dominance |
| Claude API | ข่าว ETH 24ชม. (Web Search) |

## Indicators

- **EMA 9/21/55** H1 + **EMA 21** H4 Filter
- **RSI 14**, **ADX + DI**, **ATR 14**
- **Volume Trend**, **Swing S/R**
- **Forecast Score 0–100** (Weather-style)
