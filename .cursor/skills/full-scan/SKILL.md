---
name: full-scan
description: >-
  Runs a combined scan that fuses Alpaca news catalysts with technical confluence from Month / Week / Day bars and
  writes one dated markdown report at `reports/full-scan-YYYY-MM-DD.md`. Adds deterministic Pre-Market Assessment,
  Key Levels, and Confluence (M/W/D) columns. Use when the user asks for full scan, full-mode, pre-market scan, or
  combined catalyst + technical watchlist.
---

# Full scan (news + technicals)

## Output (required)

- **Only** write one `.md` file: `reports/full-scan-YYYY-MM-DD.md`.
- In full-mode, do **not** output separate `stock-catalyst-*` and `pattern-scan-*` reports for that run.
- If same-date file exists, merge rows by ticker (preserve old order, replace rows for current tickers, append new tickers).

## Table (required)

| Symbol | Catalyst | Pre-Market Assessment | Key Levels | Confluence (M/W/D) | Setup Potential | Priority |
|--------|----------|-----------------------|------------|--------------------|-----------------|----------|

Rules:
- **Symbol:** uppercase ticker.
- **Catalyst:** one-line Alpaca + mandatory web-search synthesis.
- **Pre-Market Assessment:** deterministic from patterns JSON (rubric below), not free prose.
- **Key Levels:** deterministic `R: $X / S: $Y` from daily clustered levels.
- **Confluence:** `+ / + / -` format across `1Month / 1Week / 1Day`.
- **Setup Potential:** concise technical phrase (continuation/breakout/reversal/unclear).
- **Priority:** `Low/Medium/High` from catalyst quality + liquidity rubric.

## Pipeline

1. **Credentials:** same as other skills (`.apca` / `alpacacredentials` / `.env`, `ALPACA_ENV=live|paper`).
2. **Run both modes:**
   ```text
   dotnet run --project tools/StockCrawler -- news TICKER1 TICKER2
   dotnet run --project tools/StockCrawler -- patterns TICKER1 TICKER2
   ```
3. **Mandatory web search** for each ticker and merge with Alpaca headlines.
4. **Mandatory VIX check** (CBOE VIX spot via reliable public source such as CBOE/Yahoo/Investing) and include one market-risk line under the run header.
5. Build deterministic cells from patterns JSON.
6. Write/merge `reports/full-scan-YYYY-MM-DD.md`.

### Daily VIX market-risk line (required)

Add directly below `Run date` and `Last updated`:
- Format: `**Market risk (VIX):** <value> — <classification>.`
- If unavailable: `**Market risk (VIX):** N/A — data unavailable; apply normal position sizing discipline.`

Deterministic classification:
- `VIX < 16` -> `Low volatility regime (risk-on backdrop)`
- `16 <= VIX < 20` -> `Neutral-to-elevated volatility (selective risk)`
- `20 <= VIX < 25` -> `Elevated volatility — advise caution (smaller size, cleaner setups only)`
- `VIX >= 25` -> `High volatility — strong caution (reduce exposure, avoid marginal setups)`

## Deterministic technical rubric

### Inputs

- `trend` from `1Month`, `1Week`, `1Day`
- `1Day.indicators.lastVolZ20`
- `1Day.lastCandle.close`
- `1Day.levels[]`
- `1Day.range20`

### Pre-Market Assessment

Let:
- `nUp` = count of `trend == up` in M/W/D
- `nDown` = count of `trend == down` in M/W/D
- `vZ` = `lastVolZ20` on 1D

Mapping:
- `nUp >= 2` and `vZ >= 1.5` -> `Strong + very high volume, clear leader`
- `nUp >= 2` and `vZ >= 0.8` -> `Strong + high volume, trending`
- `nUp >= 2` and `abs(vZ) < 0.8` -> `Moderate strength, avg volume`
- `nDown >= 2` or `vZ <= -0.5` -> `Slight weakness, low volume`
- all `range` and `abs(vZ) < 0.5` -> `Likely muted (assumed)`
- else -> `Mixed, watch open`

### Key Levels

From daily `levels[]` and daily close:
- `R` = nearest level strictly above close.
- `S` = nearest level strictly below close.
- If missing one side, fallback to `range20.high` (R) / `range20.low` (S).

### Confluence (M/W/D)

Infer direction:
- if setup direction is clear, use it
- otherwise `up` when `nUp >= nDown`, else `down`

For each timeframe in order M/W/D:
- `+` if timeframe trend matches inferred direction
- `-` otherwise

Render as `+ / + / -`.

## Setup and priority

- **Setup Potential:** map to compact phrase from M/W/D pattern logic (continuation / breakout / reversal / unclear).
- **Priority:**
  - **High:** clear time-bound catalyst + unusual liquidity
  - **Medium:** mixed/sector/soft catalyst
  - **Low:** weak/no catalyst
  - never default to High without evidence.

## Merge behavior (same date)

- Replace table row for tickers in current run.
- Keep existing rows for tickers not in current run.
- Append new tickers at end.
- Refresh the single `Market risk (VIX)` line using the latest available reading.
- Refresh one `## Aggregated news` block per symbol and one `## Technical anchors` bullet per symbol.
- Keep a single final italic disclaimer line.
