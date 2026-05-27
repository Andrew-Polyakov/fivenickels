# Pattern scan — 2026-05-26

**Run date:** 2026-05-26  
**Tickers (this run):** AMZN, ON, TXN, NVDA, MU, SNDK, STX, AMD  
**As of (UTC):** 2026-05-26T12:07:38Z  

*Last updated: 2026-05-26 — refreshed MU, SNDK, ON, AMD; added AMZN, TXN, NVDA, STX; retained AMXN/ASML/BE/ARM/INTC rows.*

## Summary table

| Ticker | Setup | Direction | Confluence (M/W/D) | Trigger | Invalidation | T1 / T2 | R:R | Score | Notes |
|--------|-------|-----------|----------------------|---------|--------------|---------|-----|-------|-------|
| AMXN | — | — | — / — / — | — | — | — | — | — | Alpaca: asset not found (no bars). Typo for **AMZN**; see AMZN row. |
| ASML | — | — | + / + / ± | — | — | — | — | Medium | 1632.98; M/W up, 1D **range** (ADX 13.5). Near 20D high 1653 (−0.32×ATR); volZ −0.09. No breakout (close < high+0.25×ATR; vol <1.5), no continuation (1D not up; ~1.8×ATR above EMA20). HL 1D swings 1476→1442. |
| BE | Continuation (long) | Long | + / + / + | Pullback hold above EMA20 (~270) or retest 240–250 stack | Below 1D swing low 242.4 / cluster 240.7 | 305.9 / 351.2 | ~1.3:1 → T1; ~2.9:1 → T2 (entry ~270, stop ~242) | High | 302.59; M/W/D up; ADX 31.2; RSI 63; HL swings 250→242. Extended ~1.3×ATR above EMA20 (not pullback). Range20 high 322; volZ 0.38. |
| MU | — | — | + / + / + | Breakout needs close > 818.67 + 0.25×ATR (~50.5) with volZ ≥ 1.5; continuation needs pullback to EMA20 (~672) within 0.5×ATR | Below 1D swing low 652.2 / support cluster ~442 | 818.7 / 845.1 | — | Medium | 751.09; M/W/D up; ADX 34.2; RSI 65; **~1.7×ATR above EMA20** (no pullback). ~1.4×ATR below 20D high 818.7; volZ −1.78. HL 488→652. |
| SNDK | — | — | ± / + / + | Breakout > 1600 + 0.25×ATR (~103) on vol surge; else pullback to EMA20 (~1323) | Below swing low 1277.7 | 1600 / 1684.4 | — | Medium | 1478.76; **1M range**, W/D up; ADX 40.4; RSI 64; ~1.5×ATR above EMA20. ~1.2×ATR under 20D high 1600; volZ −1.04. HL 1050→1278. |
| ON | — | — | + / + / + | Breakout: close > 119.07 + 0.25×ATR (~1.4) on vol surge; else pullback to EMA20 (~104.4) | Below swing low 104.1 | 119.1 / 127.3 | — | Medium | 116.17; M/W/D up; ADX 38.6; RSI 67; **~2.1×ATR above EMA20**. ~0.5×ATR under 20D high 119.07; volZ −0.70. HL 99→104. |
| ARM | — | — | + / + / + | Pullback to EMA20 (~228) or breakout > 314.77 + 0.25×ATR | Below swing low 203.5 / cluster ~199 | 314.8 / 344.1 | — | Medium | 306.42; M/W/D up; ADX 37.2; RSI **77**; **~4.1×ATR above EMA20** (stretched). ~0.4×ATR under 20D high 314.8; volZ −0.44. HL 201→203. |
| INTC | — | — | + / + / + | Pullback to EMA20 (~106) or reclaim after dip; breakout > 132.7 + 0.25×ATR | Below swing low 102.4 | 132.7 / 135.6 | — | Medium | 119.85; M/W/D up; ADX **55.4**; RSI 68; ~1.7×ATR above EMA20. ~1.6×ATR below 20D high 132.7; volZ −1.77. Last bar upper wick 45% (no reversal hammer). HL 65→102. |
| AMD | — | — | + / + / + | Breakout: close > 481.26 + 0.25×ATR (~6.2) with volZ ≥ 1.5; else pullback EMA20 (~404) | Below swing low 393.5 | 481.3 / 517.5 | — | Medium | 467.64; M/W/D up; ADX 46.0; RSI 73; **~2.5×ATR above EMA20**. ~0.5×ATR under 20D high 481.3; volZ −0.21. Upper wick 58% on last 1D bar. HL 310→394. |
| AMZN | — | — | − / + / + | Reclaim/hold 20D range high 278.5 + vol; avoid long until 1M trend aligns | Below swing low 255.2 / cluster ~254 | 278.5 / 279.4 | — | Low | 266.27; **1M down**, W/D up; ADX 31.3; RSI 58. **~0.5×ATR from EMA20** but **LL** 1D swings 263→255. Tight 20D box 255–279; volZ −1.12. |
| TXN | — | — | ± / + / + | Breakout > 315.47 + 0.25×ATR (~2.5) with vol; else pullback EMA20 (~288) | Below swing low 292.7 | 315.5 / 329.0 | — | Medium | 309.05; **1M range**, W/D up; ADX 54.4; RSI 72; **~2.1×ATR above EMA20**. ~0.6×ATR under 20D high 315.5; volZ −0.17. Upper wick 57% at highs. HL 276→293. |
| NVDA | — | — | ± / + / + | Hold EMA20 (~215) and reclaim 198–211 cluster; breakout needs > 236.5 + 0.25×ATR | Below swing low 194.8 / cluster ~193 | 236.5 / 230.4 | — | Medium | 215.34; M **range**, W/D up; ADX 28.4; RSI 54; **~0.1×ATR at EMA20** (pullback zone) but **LL** swings 197→195. ~2.8×ATR below 20D high 236.5; volZ 0.12. |
| STX | — | — | + / + / + | Breakout > 841.1 + 0.25×ATR (~10.7) on vol; else pullback EMA20 (~736) | Below swing low 695.4 | 841.1 / 898.2 | — | Medium | 812.98; M/W/D up; ADX 46.4; RSI 69; **~1.8×ATR above EMA20**. ~0.7×ATR under 20D high 841.1; volZ −0.73. **LL** swings 767→695; last bar lower wick 56%. HL structure weak. |

---

*Indicators: multi-timeframe Alpaca historical bars via `tools/StockCrawler` (`patterns` mode; IEX feed in the tool, Postgres-backed crawler storage). Rows without a named setup are conditional watch states (no strict reversal/breakout/continuation confirmation at scan time). Upgrading to SIP in Alpaca’s dashboard may change available history or consolidation vs your broker. Not investment advice.*
