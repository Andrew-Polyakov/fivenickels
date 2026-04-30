# Pattern recognition scan

**Run date:** 2026-04-28

## Summary table

| Ticker | Setup | Direction | Confluence (W/D/1h/15m) | Trigger | Invalidation | T1 / T2 | R:R | Score | Notes |
|--------|-------|-----------|--------------------------|---------|--------------|---------|-----|-------|-------|
| BE | — (no rubric trigger) | — | `+ / + / - / -` | Watch only: daily close must break above 20-day range high by >=0.25 ATR with volume z >=1.5 for breakout qualification. | For long-breakout watch, invalidate if daily close loses nearest daily support cluster (~225.36) and fails to reclaim. | If breakout confirms: T1 next level cluster (~249.64); T2 = entry + 2x ATR(14D). | — (not active) | **Low** | 1D trend up, RSI 72.09, ADX 32.18; close is **0.46 ATR below** 20D high and volZ -1.16 (fails breakout confirmation). |
| TSM | — (no rubric trigger) | — | `+ / + / + / -` | Watch only: continuation requires pullback to EMA20/EMA50 within 0.5 ATR and 15m hold/reclaim; breakout requires close > range high + vol surge. | For long-watch, invalidate on sustained loss of nearest daily level cluster (~392.69). | If continuation confirms: T1 retest of 20D high (~414.41); T2 = confirmed entry + 2x ATR(14D). | — (not active) | **Medium** | 1D/1H bullish trend but 1D close is **0.72 ATR below** range high; pullback depth to EMA20 is 2.59 ATR (too extended for continuation rubric). |
| MU | — (no rubric trigger) | — | `+ / + / + / +` | Watch only: daily close must clear 20D high by >=0.25 ATR with volZ >=1.5 (breakout), or pullback to EMA20/50 within 0.5 ATR (continuation). | For long-watch, invalidate on daily close below nearest support cluster (~507.74). | If breakout confirms: T1 next level cluster (~530.89); T2 = entry + 2x ATR(14D). | — (not active) | **High** | Multi-TF trend alignment is strong, but strict rules still fail now: close is **0.25 ATR below** 20D high and volZ -0.27; no validated trigger bar yet. |
| SNDK | — (no rubric trigger) | — | `+ / + / + / +` | Watch only: needs decisive daily breakout close > 20D high + 0.25 ATR with volume z >=1.5. | For long-watch, invalidate on daily close below nearest level cluster (~1047.84). | If breakout confirms: T1 next level cluster (~1110.28); T2 = entry + 2x ATR(14D). | — (not active) | **High** | 1D trend up with ADX 34.26, but close is still **0.01 ATR below** 20D high and volZ -0.83; 15m higher-low condition is also not present on last two swings. |
| NVDA | — (no rubric trigger) | — | `- / + / + / +` | Watch only: close > 20D high + 0.25 ATR and volZ >=1.5 for breakout; or pullback to EMA20/50 within 0.5 ATR for continuation. | For long-watch, invalidate on daily close below nearest level cluster (~212.14). | If breakout confirms: T1 next level cluster (~221.16); T2 = entry + 2x ATR(14D). | — (not active) | **Medium** | 1D trend up and volZ 1.52 (good), but close is **0.05 ATR below** range high and weekly trend is range; continuation pullback criterion also not met (EMA20 distance 3.78 ATR). |

---

*Indicators: multi-timeframe Alpaca historical bars via `tools/StockCrawler` (`patterns` mode; IEX feed in the tool). No ticker met strict reversal/breakout/continuation confirmation at scan time; rows are conditional watch states, not active trade signals. Not investment advice.*
