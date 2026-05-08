# Stock catalyst scan

**Run date:** 2026-05-04

## Summary table

| Ticker | Catalyst | % change | Volume | Priority | Setup potential |
|--------|----------|----------|--------|----------|-----------------|
| TSM | Alpaca (content): Benzinga spot tied NVDA CEO commentary to TSMC as supplier in US supply-chain narrative; overlap basket read-through. | **+0.38%** (vs prior close) | 342,545 (Alpaca day bar) | **Medium** | **trend continuation** / sector AI-tape read-through |
| SNDK | Alpaca: large-cap weekly gainers listicle (momentum/earnings tape context). | **+8.14%** (vs prior close) | 495,984 (Alpaca day bar) | **Medium** | **momentum continuation** (list + strong % move) |
| ASML | No Alpaca items in 24h window; web: Q1 2026 print, raised 2026 sales guidance (AI/memory tools), buyback/dividend story; see [ASML Q1 2026](https://www.asml.com/en/news/press-releases/2026/q1-2026-financial-results), [Yahoo on guidance](https://ca.finance.yahoo.com/news/asml-guidance-climbs-ai-memory-130613921.html). | **-0.90%** (vs prior close) | 26,234 (Alpaca day bar) | **Medium** | **unclear** (weak day vs strong multi-week narrative) |
| NVDA | Alpaca: power/AI infrastructure (Chamath, hyperscalers, NVDA); China export / “older GPU” national-security debate (Baker, Newman). | **-0.58%** (vs prior close) | 3,090,371 (Alpaca day bar) | **High** | **trend continuation** on AI/compute + policy overhang into China trade narrative |

## Semiconductors

### TSM

**Tags:** #semiconductor #NVDA #TSM #benzinga

- **Jensen Huang Rejects AI Job Doom, Says Extreme Forecasts 'Not Helpful'** — 2026-05-03 UTC — [Benzinga](https://www.benzinga.com/markets/tech/26/05/52238336/jensen-huang-rejects-ai-job-doom-says-extreme-forecasts-not-helpful)

<details>
<summary>Article body (excerpt, plain text from Alpaca JSON)</summary>

Nvidia Corp. (NASDAQ: NVDA) CEO Jensen Huang pushed back Thursday against high-profile warnings that artificial intelligence will gut white-collar work, calling the most extreme forecasts counterproductive. He also pointed to potential spillover effects for suppliers such as Taiwan Semiconductor Manufacturing Co. (NYSE: TSM). (Truncated in JSON to 4k chars; full HTML stripped in `tools/StockCrawler` output and persisted in crawler Postgres storage.)

</details>

---

### SNDK

**Tags:** #semiconductor #SNDK #benzinga *+ other tickers in the same Benzinga listicle (see `alpacNews[].tags` in `dotnet run` JSON for the full set).*

- **Nokia, Intel, And Sandisk Are Among Top 10 Large-Cap Gainers Last Week (April 27-May 1)** — 2026-05-03 UTC — Benzinga

<details>
<summary>Summary (Alpaca)</summary>

A broad rally and weekly large-cap performance list; SNDK named among top large-cap gainers alongside names such as Intel and Nokia in the same wire (multi-ticker `symbols` in JSON).

</details>

---

### ASML

**Tags:** #semiconductor #ASML *(no Alpaca rows in this run’s 24h filter — use web below)*

- Alpaca **alpacNews** was empty for ASML in the last 24 hours at crawl time. Use web catalyst in **Summary table** and sector peers (TSM/NVDA) for tape context.

---

### NVDA

**Tags:** #semiconductor #NVDA #benzinga (plus other Alpaca `symbols` on multi-name wires)

- **Chamath Palihapitiya Warns Power Crunch Could Cripple OpenAI And Anthropic...** — 2026-05-04 UTC — [Benzinga](https://www.benzinga.com/markets/tech/26/05/52240337/chamath-palihapitiya-warns-power-crunch-could-cripple-openai-and-anthropic-says-elon-musk-holds-massive-ai-leverage)

<details>
<summary>Summary (Alpaca)</summary>

Power/compute constraints for AI labs; hyperscalers and infrastructure names listed; NVDA referenced in AI stack discussion.

</details>

- **Daniel Newman Backs 'Pro-National Security' Nvidia China Strategy...** — 2026-05-04 UTC — [Benzinga](https://www.benzinga.com/markets/tech/26/05/52239926/daniel-newman-backs-pro-national-security-nvidia-china-strategy-says-selling-older-gpus-could-protect-americas-ai-edge)

<details>
<summary>Summary (Alpaca)</summary>

Debate on exporting older NVDA GPUs to China vs accelerating domestic alternatives; policy scrutiny (Commerce / Coons) and revenue mix context.

</details>

## Aggregated news

**TSM —** Same Benzinga Huang wire as NVDA basket; treat as sector AI + supply-chain mention, not a TSMC-specific headline.

**SNDK —** Weekly large-cap gainers listicle; momentum label only unless fresh single-name PR breaks.

**ASML —** See web links in Summary table (guidance, Q1); Alpaca window empty this crawl.

**NVDA —** Power/compute + China export policy wires dominate this refresh.

---

*Percent change and volume: regular US session via [Alpaca](https://alpaca.markets/data) snapshot (`tools/StockCrawler`, news mode with `SendFullContentForItems`). JSON uses stripped/truncated article text; crawler Postgres storage keeps plain body in `news_articles.content`. Not investment advice.*
