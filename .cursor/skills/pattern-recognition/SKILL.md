---
name: pattern-recognition
description: >-
  Classifies technical trade setups (reversal, breakout, continuation) on US stocks from multi-timeframe
  Alpaca historical bars (Month / Week / Day) using the `patterns` subcommand of `tools/StockCrawler`. Produces
  a dated markdown report under `reports/pattern-scan-YYYY-MM-DD.md` with setup type, direction, confluence across
  timeframes, trigger / invalidation / targets in ATR units, and a Low / Medium / High score. Use when the user
  asks for a setup scan, pattern recognition, breakout or reversal or continuation candidates, a trade setup
  digest, or multi-timeframe technical confluence.
---

# Pattern recognition (Alpaca + agent rubric)

## Output (required)

- **Only** write a **`.md`** file, e.g. `reports/pattern-scan-YYYY-MM-DD.md` (use the **run date**; prefer the environment “today” when the user says “today”).
- The C# tool prints **JSON to stdout** (mode `patterns`) — intermediate only; the **.md** is the deliverable.
- If `reports/pattern-scan-YYYY-MM-DD.md` for this run **already exists**, you must **read it first** and **merge** (see below). **Do not** replace the file wholesale or drop tickers that are not in the current `dotnet run` list.

### Re-run, same run date (merge, do not clobber)

Let **C** = tickers from the **current** `dotnet run` / user request (normalize to upper case). After reading the file (if it exists), let **F** = order-preserving list of tickers in the file’s `## Summary table` (first data column per row, strip `**`).

- **Table row order:** (1) For each ticker in **F** in file order, emit one row: if the ticker is in **C**, use the **new** data from this run; if not in **C**, keep the **existing** row’s cell text **per column** (same tickers) except **schema padding:** if a stored row predates a column, set the new column to `—` for that preserved row. (2) Then **append** one row for each ticker in **C** that is **not** in **F**. Regenerate a single valid markdown table (one header, one separator, then rows) matching the current **Table (columns)**.
- **Per-ticker detail sections** (if used): same merge rules as the news skill — replace blocks for tickers in **C**; keep others; append new.
- **Title and run line:** Keep `#` title. Keep **Run date** as the scan date. Optionally add a single `*Last updated: YYYY-MM-DD (UTC or local) — [brief note].*` when any merge or refresh happened.
- **Session footnote / `---` / final italic line:** One short italic paragraph for risk; refresh on merge so it reflects the full merged set.

## Table (columns)

| Ticker | Setup | Direction | Confluence (M/W/D) | Trigger | Invalidation | T1 / T2 | R:R | Score | Notes |

- **Confluence (M/W/D):** three checkmarks or short `+/-` per timeframe aligned with the setup direction (from JSON `trend` and context: RSI, ADX, location vs `levels`).
- **Score (from confluence 0–3):** count timeframes that agree: 3 → **High**, 2 → **Medium**, ≤1 → **Low** (or `—` / skip row if no rule fires).
- **Do not** invent S/R not supported by `levels` in the JSON. **Do not** mark **High** without ≥3 TF agreement.

## Setup rubric (apply to `patterns` JSON)

- **Reversal (long):** daily `trend` is `down` (or clear failure at resistance) **and** `rsi14` on 1D &lt; 35 **and** last daily candle is a hammer / strong lower wick / bullish-engulfing (use `lastCandle` body/wick % of range) **at** a clustered level (within `0.5 * atr14` of a `levels[].price` on 1D) **and** close reclaims EMA20_1D on a confirmation bar. Mirror for **short**.
- **Breakout (long):** 1D last close &gt; `range20.high` by at least `0.25 * indicators.atr14` (1D) **and** `lastVolZ20` on 1D ≥ 1.5 **and** next 1D close holds above the breakout / retest level. Mirror for **short** (breakdown past `range20.low` with similar volume confirmation).
- **Continuation (long):** 1M, 1W and 1D `trend` are `up` **and** 1D `adx14` ≥ 20 **and** last close on 1D is within `0.5 * atr14` of EMA20 or EMA50 (pullback to stack) **and** 1D `swingLows` show a higher low on the last two printed swings (`swingLows[-1].price > swingLows[-2].price`; if fewer than 2, label **unclear**). Mirror for **short**.

## Risk frame

- **Invalidation:** beyond the nearest opposing `levels` / swing (`swingHighs` / `swingLows`) that would negate the thesis.
- **T1 / T2:** T1 = next major clustered `levels` in the trade direction; T2 = a measured move or **2×** 1D `atr14` from entry in direction of the trade. State **R:R** only when both entry (conceptual) and stops are anchorable to JSON data.

## Pipeline

1. **Set credentials** (same as the stock-news-crawler skill): `APCA_API_KEY_ID` / `APCA_API_SECRET_KEY` in `.apca` / `alpacacredentials` / `.env` (walk up from cwd), with `ALPACA_ENV=live|paper` matching the dashboard. Never commit keys.
2. **Run the tool (patterns mode):**
   ```text
   dotnet run --project tools/StockCrawler -- patterns TICKER1 TICKER2
   ```
   Optional debug (large JSON): add `--with-bars` after `patterns` to include raw bars. The tool requests historical bars with the **IEX** feed (free Alpaca data tier), writes a local SQLite cache at `.cache/trades.sqlite`, and appends only new bars per run for M/W/D slices.
3. **Classify** each ticker with the rubric; fill the table; add **Notes** with only auditable numbers (trends, RSI, ADX, ATR, distance to levels in ATRs, wick %).
4. **Write** `reports/pattern-scan-YYYY-MM-DD.md` (merge if same-day re-run).

## Data sources (reference)

- [Alpaca market data](https://alpaca.markets/data) — historical bars, consolidated feed per subscription. The tool uses REST `ListHistoricalBarsAsync` (multi-page) for M / W / D.
- The tool does **not** perform web search; catalyst context is out of scope unless the user explicitly asks to combine with the news scan.

## Code style (C# in `tools/StockCrawler`)

Java-influenced: K&R braces, 4 spaces, `camelCase` for non–entry-point methods, `PascalCase` for types, `UPPER_SNAKE` for constants. Match the SDK’s public names where required. See root `.editorconfig`.

## Session footnote (template)

*Indicators: multi-timeframe Alpaca historical bars via `tools/StockCrawler` (`patterns` mode; IEX feed in the tool, local SQLite cache). Upgrading to SIP in Alpaca’s dashboard may change available history or consolidation vs your broker. Not investment advice.*
