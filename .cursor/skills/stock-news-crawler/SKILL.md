---
name: stock-news-crawler
description: >-
  Produces a dated markdown report with a table of US stock tickers: catalyst (aggregated from Alpaca news plus
  mandatory web search), percentage change, volume, priority (low/medium/high), and a short “Setup potential”
  column (e.g. momentum or trend continuation, sector breakout) using a fixed rubric. Uses the
  repo C# tool with Alpaca.Markets for price and volume. Use when the user asks for a stock catalyst scan, watchlist
  news digest, or a .md table of tickers for today.
---

# Stock news crawler

## Output (required)

- **Only** write a **`.md`** file for the user, e.g. `reports/stock-catalyst-YYYY-MM-DD.md` (use the **run date**; prefer the environment “today” when the user says “today”).
- Include: title, run date, main **table** (see schema), optional **Aggregated news** subsection with bullets per ticker.
- The C# tool prints **JSON to stdout** — intermediate only; the **.md** is the deliverable.
- If `reports/stock-catalyst-YYYY-MM-DD.md` for this run **already exists**, you must **read it first** and **merge** (see below). **Do not** replace the file wholesale or drop tickers that are not in the current `dotnet run` list.

### Re-run, same run date (merge, do not clobber)

Let **C** = tickers from the **current** `dotnet run ...` / user request (normalize to upper case). After reading the file (if it exists), let **F** = order-preserving list of tickers in the file’s `## Summary table` (first data column per row, strip `**`).

- **Table row order:** (1) For each ticker in **F** in file order, emit one row: if the ticker is in **C**, use the **new** data from this run; if not in **C**, keep the **existing** row’s cell text **per column** (same tickers) except **schema padding:** if a stored row predates a column in **Table (columns)**, set the new column (e.g. **Setup potential**) to `—` for that preserved row. (2) Then **append** one row for each ticker in **C** that is **not** in **F**. Regenerate a single valid markdown table (one header, one separator, then rows) matching the current **Table (columns)**. **Never** remove a row for a symbol that appears in the file just because the latest run omitted it.
- **Aggregated news:** Split the existing `## Aggregated news` body into one block per symbol using lines that start with `**TICKER —` (TICKER upper). For every ticker in **F** ∪ **C** (optional order: follow the summary table’s ticker order): if the ticker is in **C**, **replace** that block with the new aggregate; if the ticker is only in **F**, **retain** the old block; if the ticker is only in **C** and new to the file, **append** new `**TICKER —` blocks. If a prior report had no Aggregated section, add one with only the current and/or merged content as needed.
- **Title and run line:** Keep `#` title. Keep **Run date** as the scan date. Optionally add a single `*Last updated: YYYY-MM-DD (UTC or local) — [brief note, e.g. added X, refreshed Y].*` on its own line after the run line when any merge or refresh happened; do not duplicate long disclaimers there.
- **Session footnote / `---` / final italic line:** Use **one** short italic paragraph at the end for same-day “why High/Medium” and risk notes. On merge, **refresh** that paragraph so it still reflects the **full** merged set of tickers (e.g. remove obsolete rationale if a symbol was only refreshed for numbers). The horizontal rule before it is optional; do not stack multiple redundant footers.

## Table (columns)

| Ticker | Catalyst | % change | Volume | Priority | Setup potential |
|--------|----------|----------|--------|----------|-----------------|
| UPPER | One line: Alpaca + web, deduped; or `—` | Regular session, footnote if extended | Source label + scale if huge | `Low` / `Medium` / `High` | One short phrase (see below) or `—` |

- **Catalyst** = **aggregated** text: Alpaca headlines first, then web-unique points (step 2–4 below). Do not invent events; if both empty, `—` and a footnote.
- **Setup potential** = discretionary, **one** compact label: e.g. **momentum continuation**, **trend continuation**, **breakout (sector strong)** (only if sector/peer read-through in news or a clear tape read justifies it), **mean reversion** / **fade** if the move is stretched vs. catalyst, **unclear** / `—` when there is no coherent setup. Do not conflate with **Priority**; keep it a separate column.

## Pipeline

1. **Set credentials** (never commit keys). The C# tool reads **`APCA_API_KEY_ID`** and **`APCA_API_SECRET_KEY`** from a file **first** (walks up from cwd and from the app for **`.apca`**, then **`alpacacredentials`**, then **`.env`**, in that order in each directory). It parses `KEY=value` lines and allows a single leading `#` on a line so commented-out assignments still work. Add **`ALPACA_ENV=paper`** or **`ALPACA_ENV=live`** in that file to match the key in the [Alpaca](https://alpaca.markets/) dashboard (wrong choice can cause 401). If the file has no complete pair, it falls back to `DotNetEnv` + process environment. The same key names support an **`ALPACA_*`** prefix. Rotate any leaked key in the dashboard first.
2. **Run the C# data tool** (snapshots + Alpaca news):

   ```text
   dotnet run --project tools/StockCrawler -- TICKER1 TICKER2
   ```

   Parse JSON: `asOfUtc`, per-ticker `lastPrice`, `previousClose`, `dayVolume`, `percentChange`, `alpacNews[]`. Field `webHints` starts empty; you fill it.
3. **Web search (mandatory for every ticker):** at least one query per symbol, e.g. `"{TICKER}" stock news` plus the run date. Add 1–2 `webHints` (title/snippet + source) into your working notes; stagger requests if there are many tickers.
4. **Aggregate** Alpaca + web into one **Catalyst** cell; dedupe near-duplicates; keep the table one line, optional bullets under “Aggregated news.”
5. **Setup potential:** from price/volume + catalyst + (optional) sector/peer or index context from the same research; output one label as in the table. If nothing stands out, `—` or **unclear**.
6. **Priority (rubric):**
   - **High** — clear time-bound catalyst (earnings, FDA, M&A, major contract, regulatory) **and** unusual liquidity **or** strong user TradingView note aligned with news.
   - **Medium** — soft catalyst, sector read-through, mixed signals, or meaningful move without a sharp headline.
   - **Low** — no/weak catalyst, routine volume, generic macro only.
   - If unsure: **Medium**; never default to **High** without evidence.
7. **Optional:** User may paste a **TradingView** one-liner; use it in **Setup potential** when it fits, and in **Priority** only when it fits the evidence.

## Data sources (reference)

- [Alpaca market data](https://alpaca.markets/data) — REST: snapshots, news. [C# SDK](https://github.com/alpacahq/alpaca-trade-api-csharp) (`Alpaca.Markets` NuGet).
- TradingView **Charting Library** is for **embedded charts**, not this report; see [API overview](https://www.tradingview.com/charting-library-docs/latest/api/) only if the user later builds a custom UI.

## Code style (C# in `tools/StockCrawler`)

Java-influenced: K&R braces, 4 spaces, `camelCase` for non-entry methods/locals, `PascalCase` for types, `UPPER_SNAKE` for constants. Match **SDK** public names where required. See root `.editorconfig`.

## Session footnote (template)

Add when needed: *Percent change and volume: regular US session (or: extended) via Alpaca snapshot; plan/tier may affect feed (e.g. IEX vs consolidated). Not investment advice.*
