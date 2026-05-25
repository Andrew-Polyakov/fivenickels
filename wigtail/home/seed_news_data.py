"""
Short stock-market style blurbs for seeding TaggedContentPage per GICS sector.
Each entry: slug_suffix (unique under sector), title, lede (markdown), body_paragraphs (plain text).
"""

from __future__ import annotations

from typing import TypedDict


class ArticleSeed(TypedDict):
    slug_suffix: str
    title: str
    lede: str
    body_paragraphs: list[str]
    tag_slugs: list[str]


# Shared tag vocabulary for similarity / tag cloud (slugs stable across runs).
TAG_DEFINITIONS: tuple[tuple[str, str], ...] = (
    ("Earnings", "earnings"),
    ("Macro & rates", "macro-rates"),
    ("M&A / corporate", "m-a"),
    ("Dividends & yield", "dividends"),
    ("Momentum / flow", "momentum"),
    ("Regulation", "regulation"),
    ("Supply chain", "supply-chain"),
    ("Product cycle", "product-cycle"),
    ("Commodities", "commodities"),
    ("Data centers / AI infra", "data-centers"),
    ("Clinical / FDA", "clinical-fda"),
    ("Cap rates / REITs", "reits"),
    ("Grid & power", "utilities-power"),
    ("Volatility / tape", "volatility"),
    ("China demand", "china-demand"),
    ("Rates curve", "rates-curve"),
    ("AI supply chain", "ai-supply-chain"),
    ("Consumer confidence", "consumer-confidence"),
    ("Housing / rates", "housing"),
    ("Oilfield services", "oil-services"),
    ("Banks / credit", "banks-credit"),
    ("Retail media", "retail-media"),
    ("ESG & flows", "esg-flows"),
    ("EM / FX", "em-fx"),
    ("Buybacks", "buybacks"),
    ("Insurance", "insurance"),
)

SECTOR_ARTICLES: dict[str, list[ArticleSeed]] = {
    "communication-services": [
        {
            "slug_suffix": "streaming-arpu",
            "title": "Streaming giants test ARPU without churn spike",
            "lede": "**Readout:** price hikes vs. engagement — what the tape is pricing.",
            "body_paragraphs": [
                "Major streamers are walking a tightrope between ad-tier mix and subscription price increases. Street models assume modest ARPU lift through 2026 with churn held near prior-cycle norms.",
                "Cable and legacy bundles continue to bleed share, but broadband attach and wireless bundles still anchor cash flow for integrated telco names. Watch Q/Q net adds and ARPU deltas on the next print.",
            ],
            "tag_slugs": ["earnings", "momentum", "volatility", "consumer-confidence"],
        },
        {
            "slug_suffix": "telco-capex",
            "title": "Telco capex: fiber finish lines and spectrum carry",
            "lede": "Fiber build **nearing completion** in several metros; focus shifts to returns.",
            "body_paragraphs": [
                "After years of elevated fiber spend, several national carriers are guiding to lower capital intensity as coverage targets are met. Investors are rotating from pure build stories toward FCF and dividend resilience.",
                "Spectrum debt towers and lease obligations remain the hidden leverage sheet item—credit spreads in telco paper have been steadier than in prior cycles.",
            ],
            "tag_slugs": ["dividends", "macro-rates"],
        },
        {
            "slug_suffix": "ad-market-recovery",
            "title": "Ad market: brand spend flickers back in digital",
            "lede": "Brand budgets **stabilize**; performance channels still take share of marginal dollar.",
            "body_paragraphs": [
                "Digital ad platforms are seeing sequential improvement in brand-oriented verticals, while performance and retail media remain the growth engines. Macro sensitivity is still high—any hard landing narrative hits multiples first.",
                "Social and short-form inventory growth keeps CPM pressure real; look for commentary on AI-assisted creative tools as a cost lever for advertisers.",
            ],
            "tag_slugs": ["macro-rates", "momentum", "retail-media", "rates-curve"],
        },
        {
            "slug_suffix": "gaming-pipeline",
            "title": "Gaming slate: fewer mega-hits, longer tails",
            "lede": "Studios lean on **live ops** and catalog monetization between blockbuster releases.",
            "body_paragraphs": [
                "AAA release calendars have thinned post-pandemic boom, pushing publishers toward GAAS monetization and back-catalog licensing. Hardware attach rates for new consoles remain a swing factor for packaged goods exposure.",
                "Regulatory scrutiny on loot boxes and minors’ spend is inching higher in the EU—compliance costs are manageable but headline risk persists.",
            ],
            "tag_slugs": ["product-cycle", "regulation"],
        },
        {
            "slug_suffix": "media-rights",
            "title": "Sports rights inflation: who blinks first?",
            "lede": "Rights fees **outrun** linear ad decline; DTC bundles try to square the circle.",
            "body_paragraphs": [
                "Live sports remain the glue for linear bundles even as cord-cutting grinds on. Networks are pushing more inventory to streaming DTC while renegotiating affiliate fees with distributors.",
                "Private equity and strategic buyers still circle regional sports networks at distressed prints—restructuring outcomes will set comps for the next cycle of rights auctions.",
            ],
            "tag_slugs": ["m-a", "earnings", "volatility", "esg-flows"],
        },
    ],
    "consumer-discretionary": [
        {
            "slug_suffix": "auto-inventory",
            "title": "Dealers trim inventory as incentives normalize",
            "lede": "**Autos:** days-supply easing from pandemic highs; mix tilts to trucks again.",
            "body_paragraphs": [
                "North American dealer lots are closer to historical days-supply after two years of imbalance. OEMs are calibrating incentives to protect transaction prices without spooking residual-value curves.",
                "EV penetration growth has cooled from exponential to incremental; hybrid attach is the stealth share gainer as range anxiety lingers for mass-market buyers.",
            ],
            "tag_slugs": ["supply-chain", "product-cycle"],
        },
        {
            "slug_suffix": "luxury-china",
            "title": "Luxury: China travel rebound uneven by corridor",
            "lede": "High-end names watch **duty-free** and outbound tourist flows into Europe.",
            "body_paragraphs": [
                "European luxury bellwethers are seeing softer mainland China spend but better Japanese and Southeast Asian tourist mix. FX is a tailwind for euro-reported margins when the dollar holds firm.",
                "US aspirational consumer has traded down in entry leather goods; top-of-house limited editions still clear waitlists.",
            ],
            "tag_slugs": ["macro-rates", "momentum", "china-demand", "em-fx"],
        },
        {
            "slug_suffix": "home-improvement",
            "title": "Big-ticket housing: rate lock-in freezes remodel cycles",
            "lede": "**DIY** vs. pro: bifurcation as mobility stays low for mortgage holders.",
            "body_paragraphs": [
                "Existing-home turnover near cycle lows keeps big-ticket project pipelines elongated. Pro channel holds up better than DIY as contractors work through backlogs tied to insurance and aging housing stock.",
                "Commodity lumber volatility has calmed, helping margin recapture for building products distributors.",
            ],
            "tag_slugs": ["macro-rates", "supply-chain", "housing", "rates-curve"],
        },
        {
            "slug_suffix": "restaurants-traffic",
            "title": "Restaurants: traffic flat, pricing carries the comp",
            "lede": "Quick service **resilient**; casual dining still promotional in exurban pockets.",
            "body_paragraphs": [
                "System-wide same-store sales are being carried more by price than traffic across much of casual dining. Quick-service value tiers are absorbing trade-down from mid-market concepts.",
                "Commodity baskets for proteins and oils have moderated YoY, giving operators a window to rebuild store-level margins if labor inflation cools.",
            ],
            "tag_slugs": ["earnings", "commodities"],
        },
        {
            "slug_suffix": "ecom-logistics",
            "title": "E-commerce: delivery speed as table stakes",
            "lede": "One-day networks **compress** conversion funnels; logistics opex in focus.",
            "body_paragraphs": [
                "Fulfillment networks optimized for next- and same-day delivery are pressuring smaller merchants’ unit economics. Aggregators are leaning on ad-tech and third-party logistics partnerships to defend take rates.",
                "Returns rates remain structurally higher online; reverse-logistics costs are an under-modelled margin line.",
            ],
            "tag_slugs": ["supply-chain", "momentum", "ai-supply-chain", "consumer-confidence"],
        },
    ],
    "consumer-staples": [
        {
            "slug_suffix": "private-label",
            "title": "Private label share grinds higher in center store",
            "lede": "**Staples:** retailers flex shelf space; national brands defend with pack price.",
            "body_paragraphs": [
                "Grocers continue to allocate facings to private label in dry grocery and household basics. National brands are responding with shrinkflation optics and targeted promotions rather than broad list-price cuts.",
                "Volume elasticity has been softer than historical models—consumers still trade within tier rather than out of category.",
            ],
            "tag_slugs": ["earnings", "supply-chain"],
        },
        {
            "slug_suffix": "beverage-premiumization",
            "title": "Beverages: premium mix offsets volume softness",
            "lede": "**Premium SKUs** and on-premise mix support margins where volume is flattish.",
            "body_paragraphs": [
                "Global brewers and spirits houses are leaning on price/mix in premium tiers as emerging-market volume normalizes post reopening. US on-premise traffic is steady but not booming.",
                "Input costs for glass and aluminum have eased from peaks, helping COGS lines if hedges roll favorably.",
            ],
            "tag_slugs": ["commodities", "earnings"],
        },
        {
            "slug_suffix": "tobacco-next-gen",
            "title": "Next-gen nicotine: regulatory paths diverge by region",
            "lede": "Heated products **gaining** share where allowed; US PMTA overhang remains.",
            "body_paragraphs": [
                "International markets with clearer reduced-risk product frameworks are seeing faster category migration. US market remains litigation- and FDA-timeline dependent, compressing multiples on domestic exposure.",
                "Cash cows in combustibles still fund buybacks while transition narratives play out slowly.",
            ],
            "tag_slugs": ["regulation", "dividends"],
        },
        {
            "slug_suffix": "staples-valuation",
            "title": "Staples multiples: bond-proxy bid meets growth scarcity",
            "lede": "Sector screens **expensive** vs. history unless real rates spike hard.",
            "body_paragraphs": [
                "Defensive cash flows attracted a bid when recession chatter was loudest; as soft-landing narratives dominate, relative P/Es look full. Dividend growth rates remain mid-single-digit for large caps.",
                "GLP-1 overhang on packaged snacking is still more sentiment than measurable consumption data for most SKUs.",
            ],
            "tag_slugs": ["macro-rates", "dividends"],
        },
        {
            "slug_suffix": "emerging-markets-staples",
            "title": "EM staples: FX and route-to-market dominate the story",
            "lede": "Strong dollar years **compress** reported growth even when local units hum.",
            "body_paragraphs": [
                "Multinational staples with heavy EM footprints are lapping easier FX compares in some corridors, but Nigeria-style currency markets still create earnings noise.",
                "Route-to-market digitization is lowering working-capital needs for distributors with scale.",
            ],
            "tag_slugs": ["macro-rates", "earnings"],
        },
    ],
    "energy": [
        {
            "slug_suffix": "crude-inventories",
            "title": "Crude: inventories build as refinery maintenance peaks",
            "lede": "**WTI** range-bound; product cracks tell the margin story for integrateds.",
            "body_paragraphs": [
                "Weekly commercial crude builds have surprised consensus during shoulder-season refinery turnarounds. OPEC+ discipline versus non-OPEC growth remains the medium-term balancing item for flat price.",
                "Integrated oils are still favored by income funds for buyback cadence even as upstream pure-plays screen more torque to spot.",
            ],
            "tag_slugs": ["commodities", "macro-rates", "oil-services", "volatility"],
        },
        {
            "slug_suffix": "lng-contracting",
            "title": "LNG contracting wave: price review clauses heat up",
            "lede": "Long-term offtake **reopened** for renegotiation as JKM-TTF spreads normalize.",
            "body_paragraphs": [
                "European buyers are locking in more flexible US-linked contracts post crisis, while Asian utilities still anchor on oil-indexed legacy deals with periodic reviews.",
                "US liquefaction trains with brownfield debottleneck potential remain the marginal supply growth lever this decade.",
            ],
            "tag_slugs": ["commodities", "m-a"],
        },
        {
            "slug_suffix": "us-shale-discipline",
            "title": "US shale: discipline holds even with WTI above fiscal breakevens",
            "lede": "Operators favor **buybacks** over growth capex; rig count flatlines.",
            "body_paragraphs": [
                "Public independents continue to prioritize shareholder returns over double-digit volume growth. Private equity–backed privates still provide marginal barrels but consolidation is slowing.",
                "Service pricing for sand and frac spreads has normalized from 2022 extremes, aiding well economics.",
            ],
            "tag_slugs": ["earnings", "dividends"],
        },
        {
            "slug_suffix": "offshore-deepwater",
            "title": "Deepwater FIDs: cycle visibility into late decade",
            "lede": "FPSO orders and **subsea** tree demand underpin services backlog.",
            "body_paragraphs": [
                "Guyana-type profiles and renewed Brazil pre-salt activity are anchoring deepwater final investment decisions. Services with proprietary subsea technology are booking multiyear slots.",
                "Day rates for high-spec floaters have plateaued but remain well above prior-cycle medians.",
            ],
            "tag_slugs": ["product-cycle", "earnings"],
        },
        {
            "slug_suffix": "refining-margins",
            "title": "Refining cracks: seasonal weakness before summer driving",
            "lede": "**3-2-1** spreads compress; RINs and renewable diesel credits matter again.",
            "body_paragraphs": [
                "Refiners are navigating softer middle-distillate cracks relative to last year’s extremes. Renewable diesel credits and California LCFS dynamics swing cash margins for West Coast complex operators.",
                "Strategic inventory policy shifts by IEA members can still whipsaw near-dated product curves.",
            ],
            "tag_slugs": ["commodities", "regulation"],
        },
    ],
    "financials": [
        {
            "slug_suffix": "nii-outlook",
            "title": "Banks: NII inflection priced—credit comes next",
            "lede": "**Net interest income** peaks in rearview; reserve builds the swing factor.",
            "body_paragraphs": [
                "Money-center banks are guiding to modest NII compression as deposit betas catch up and asset yields roll. Markets have largely moved on from rate-upside scenarios for the group.",
                "Commercial real estate office exposure remains the idiosyncratic charge risk headline, even as actual loss content has been manageable outside a few names.",
            ],
            "tag_slugs": ["macro-rates", "earnings", "banks-credit", "rates-curve"],
        },
        {
            "slug_suffix": "card-volumes",
            "title": "Card networks: cross-border volumes reaccelerate",
            "lede": "T&E spend **strong**; US consumer debit growth moderates from pandemic highs.",
            "body_paragraphs": [
                "Visa/Mastercard-type models continue to benefit from resilient cross-border travel and services spend. US debit growth is normalizing as stimulus-era savings buffers fade for lower-income cohorts.",
                "Regulatory chatter on routing and interchange caps is perennial noise for the stocks.",
            ],
            "tag_slugs": ["momentum", "regulation"],
        },
        {
            "slug_suffix": "ib-fees",
            "title": "Investment banking: ECM windows open narrowly",
            "lede": "IPO and **follow-on** calendars lumpy; M&A dialogue better than closings.",
            "body_paragraphs": [
                "Equity issuance is episodic—windows open when volatility compresses and rates stabilize. M&A pipelines are busier at the mid-market than mega-cap due to antitrust friction at the top end.",
                "Fixed income underwriting has been steadier than equities, supporting diversified bulge-bracket fee pools.",
            ],
            "tag_slugs": ["m-a", "earnings"],
        },
        {
            "slug_suffix": "insurance-cat",
            "title": "P&C insurers: cat loads normalize after severe seasons",
            "lede": "Reinsurance renewals **firmer** but modeled; pricing still positive in personal lines.",
            "body_paragraphs": [
                "Property cat reinsurance costs remain elevated versus pre-2020 baselines, but rate-on-line increases are slowing. Primary carriers are pushing through rate in homeowners faster than regulators in some states allow.",
                "Auto severity trends tied to repair costs and litigation are still the swing line for personal auto combined ratios.",
            ],
            "tag_slugs": ["earnings", "macro-rates"],
        },
        {
            "slug_suffix": "asset-managers-flows",
            "title": "Asset managers: passive flows mask active outflows",
            "lede": "**ETF** complexes win share; traditional mutual fund complexes shrink AUM.",
            "body_paragraphs": [
                "Net new money continues to favor low-cost index and factor ETFs, pressuring expense ratios for active-only shops. Alternatives and private credit sleeves are the organic growth hunt for diversified managers.",
                "Money market assets remain near peaks—any re-risking rotation would be a tailwind for equity AUM fees.",
            ],
            "tag_slugs": ["momentum", "macro-rates"],
        },
    ],
    "health-care": [
        {
            "slug_suffix": "glp-1-spillover",
            "title": "GLP-1 narrative: device and diagnostics read-throughs evolve",
            "lede": "Obesity pharmacotherapy **reshapes** medtech demand curves in bariatrics.",
            "body_paragraphs": [
                "Incumbent device names tied to invasive weight-loss procedures are modeling slower growth curves as GLP-1 adoption rises, while sleep apnea and cardiometabolic monitoring angles get fresh investor attention.",
                "Payers remain focused on prior authorization and step-therapy frameworks to manage budget impact.",
            ],
            "tag_slugs": ["clinical-fda", "product-cycle"],
        },
        {
            "slug_suffix": "biotech-financing",
            "title": "Biotech: follow-on windows revive for quality platforms",
            "lede": "Smid-cap **cash runways** extend when crossover books lean in on data.",
            "body_paragraphs": [
                "After a long financing drought, companies with clean datasets and credible registrational paths are tapping ATM and follow-on markets at less punitive discounts. The bifurcation between haves and have-nots is extreme.",
                "BD&L interest from large pharma for ADC and radiopharma assets remains high.",
            ],
            "tag_slugs": ["m-a", "momentum"],
        },
        {
            "slug_suffix": "hospital-utilization",
            "title": "Hospital operators: utilization back to pre-COVID bands",
            "lede": "Inpatient acuity **mix** supports revenue per admission; labor still a headwind.",
            "body_paragraphs": [
                "Same-facility volume metrics have normalized, with surgical mix skewing toward higher-acuity cases that reimburse better on a net basis. Nurse wage inflation is cooling but not reversing.",
                "Medicaid redetermination tail risks are largely in the numbers for most systems.",
            ],
            "tag_slugs": ["earnings", "regulation"],
        },
        {
            "slug_suffix": "generics-pricing",
            "title": "Generics pricing: deflation moderates from worst levels",
            "lede": "Consolidated industry **rationalizes** capacity; FDA import alerts still a risk.",
            "body_paragraphs": [
                "US generic price erosion has slowed as industry consolidation idles excess capacity. India-based suppliers remain critical to US supply but face periodic FDA inspection volatility.",
                "Biosimilar uptake curves for Humira-type molecules are tracking varied by molecule and rebate contracting.",
            ],
            "tag_slugs": ["supply-chain", "regulation"],
        },
        {
            "slug_suffix": "tools-diagnostics",
            "title": "Life science tools: China recovery uneven",
            "lede": "Instrument demand **lumpy**; consumables attach rates the quality signal.",
            "body_paragraphs": [
                "Sequencing and mass-spec instrument lines are seeing slower China recovery than Western academic budgets. Recurring consumables growth remains the key multiple support for platform names.",
                "Biopharma capex caution into 2026 budgets could cap new instrument placements.",
            ],
            "tag_slugs": ["macro-rates", "earnings"],
        },
    ],
    "industrials": [
        {
            "slug_suffix": "aero-oem-ramp",
            "title": "Commercial aero: OEM ramp constraints ease slowly",
            "lede": "**737**-class narrowbody rates the gating item for supply chain health.",
            "body_paragraphs": [
                "Engine MRO bottlenecks and forge capacity for critical rotating parts are still elongating lead times for new narrowbody deliveries. Lessors remain disciplined on lease rates versus asset values.",
                "Aftermarket parts pricing power remains elevated versus historical norms.",
            ],
            "tag_slugs": ["supply-chain", "product-cycle"],
        },
        {
            "slug_suffix": "defense-backlog",
            "title": "Defense primes: backlog duration stretches with munitions restock",
            "lede": "DoD budgets **sticky**; execution risk on labor and supply still real.",
            "body_paragraphs": [
                "Multi-year munitions and missile modernization programs are stretching prime backlogs. Margin pressure from fixed-price development phases is partially offset by learning curves on mature production lines.",
                "International NATO-compatible sales layers on top of domestic demand.",
            ],
            "tag_slugs": ["earnings", "macro-rates"],
        },
        {
            "slug_suffix": "automation-capex",
            "title": "Factory automation: capex pause or pivot to ROI projects?",
            "lede": "Robotics orders **normalize** after post-COVID catch-up wave.",
            "body_paragraphs": [
                "Discrete automation vendors are seeing longer sales cycles as manufacturers prioritize quick-payback retrofit projects over greenfield lines. China demand remains a swing factor for global order books.",
                "Labor scarcity in developed markets still underpins automation ROI math.",
            ],
            "tag_slugs": ["product-cycle", "macro-rates"],
        },
        {
            "slug_suffix": "trucking-freight",
            "title": "Trucking: spot rates troughing—contract renewals next",
            "lede": "Capacity exits **help** spot; contract repricing lags by quarters.",
            "body_paragraphs": [
                "TL spot markets are showing early signs of balance after a prolonged downcycle. Asset-based carriers with dense networks can rebuild OR faster than marginal operators.",
                "Intermodal remains competitive with diesel price normalization.",
            ],
            "tag_slugs": ["commodities", "momentum"],
        },
        {
            "slug_suffix": "hvac-infrastructure",
            "title": "HVAC and climate tech: resi replacement cycle aging in",
            "lede": "Heat pump incentives **patchy** by state; commercial retrofit steadier.",
            "body_paragraphs": [
                "Residential HVAC replacement demand is supported by an aging installed base, though high rates dampen discretionary upgrades. Commercial efficiency mandates in large metros support retrofit pipelines.",
                "Refrigerant regulation transitions continue to favor OEMs with compliant portfolios.",
            ],
            "tag_slugs": ["regulation", "earnings"],
        },
    ],
    "information-technology": [
        {
            "slug_suffix": "hyperscale-capex",
            "title": "Hyperscale capex: AI training spend still front-loaded",
            "lede": "**GPU** supply tightness easing; power and land the next bottlenecks.",
            "body_paragraphs": [
                "Cloud titans continue to guide capex growth well above revenue as they build training and inference capacity. Investors are watching utilization curves and monetization paths for copilots and API pricing.",
                "Secondary effects in data center cooling and high-voltage equipment orders remain strong.",
            ],
            "tag_slugs": ["data-centers", "earnings", "ai-supply-chain", "rates-curve"],
        },
        {
            "slug_suffix": "semis-cycle",
            "title": "Semis: memory pricing inflects before logic fully recovers",
            "lede": "DRAM **spreads** widen; foundry utilization bottoming in mature nodes.",
            "body_paragraphs": [
                "Memory vendors are exercising supply discipline earlier in this cycle, supporting ASP recovery narratives. Logic/foundry is more fragmented—auto and industrial destocking still a drag for analog-exposed names.",
                "Export controls on leading-edge China access remain a structural overhang for equipment and EDA vendors.",
            ],
            "tag_slugs": ["product-cycle", "regulation"],
        },
        {
            "slug_suffix": "enterprise-software",
            "title": "Enterprise software: seat consolidation pressures net new logos",
            "lede": "CFOs push **vendor rationalization**; AI features bundled to defend ACV.",
            "body_paragraphs": [
                "Net retention rates have normalized lower across SaaS as customers rationalize overlapping tools. Incumbents are bundling generative features into suites to reduce churn risk.",
                "Usage-based pricing models are gaining share in observability and data infra.",
            ],
            "tag_slugs": ["earnings", "momentum"],
        },
        {
            "slug_suffix": "cyber-budgets",
            "title": "Cybersecurity budgets: must-spend vs. nice-to-have bifurcates",
            "lede": "Identity and **cloud** posture tools prioritized; point solutions squeezed.",
            "body_paragraphs": [
                "CISOs are consolidating spend on platforms that map to regulatory and insurance-driven controls. Smaller point vendors face longer sales cycles unless they attach to hyperscaler marketplaces.",
                "M&A by platforms remains the exit path for best-of-breed features.",
            ],
            "tag_slugs": ["m-a", "regulation"],
        },
        {
            "slug_suffix": "hardware-refresh",
            "title": "PC and handset refresh: AI PCs incremental, not revolutionary—yet",
            "lede": "Replacement **elongated**; on-device models a 2026–27 consumer story.",
            "body_paragraphs": [
                "Corporate PC refresh cadence remains stretched as remote work stabilized device lives. AI PC attach is early—enterprise buyers are piloting rather than fleet-swapping.",
                "Handset replacement cycles in developed markets are lengthening absent killer on-device AI apps.",
            ],
            "tag_slugs": ["product-cycle", "macro-rates"],
        },
    ],
    "materials": [
        {
            "slug_suffix": "copper-china",
            "title": "Copper: China property stimulus hopes vs. real demand data",
            "lede": "Inventories **low**; mine supply disappointments still possible.",
            "body_paragraphs": [
                "Copper continues to trade the tension between weak developed manufacturing PMIs and China stimulus expectations. Mine grade decline and project slippage keep supply-side risks live.",
                "Scrap availability has buffered some refined deficits but cannot solve structural ore issues alone.",
            ],
            "tag_slugs": ["commodities", "macro-rates"],
        },
        {
            "slug_suffix": "steel-spreads",
            "title": "Steel spreads: imports and scrap costs set regional margins",
            "lede": "US sheet **spreads** volatile on trade case chatter.",
            "body_paragraphs": [
                "Domestic sheet pricing remains sensitive to import offers and currency. Mini-mill scrap input costs have moderated from peaks, helping variable margins for EAF operators.",
                "Infrastructure-related demand is steady but not enough to offset cyclical auto softness in some grades.",
            ],
            "tag_slugs": ["commodities", "earnings"],
        },
        {
            "slug_suffix": "chemicals-spreads",
            "title": "Specialty vs. commodity chemicals: divergence widens",
            "lede": "Commodity chains **oversupplied**; specialties defend with formulation lock-in.",
            "body_paragraphs": [
                "Ethylene chain oversupply in several regions is capping commodity chemical margins. Specialty additives tied to ag and personal care are holding pricing better on contract pass-throughs.",
                "European energy pass-through mechanisms still differentiate regional cost curves.",
            ],
            "tag_slugs": ["supply-chain", "earnings"],
        },
        {
            "slug_suffix": "packaging-paper",
            "title": "Containerboard: destocking largely done—pricing power returning?",
            "lede": "Box demand **stabilizes**; export markets set the incremental tone.",
            "body_paragraphs": [
                "North American box demand has troughed from the inventory correction. Producers are testing price increases into a less fearful customer base.",
                "Recycled fiber input costs remain manageable versus prior volatility.",
            ],
            "tag_slugs": ["momentum", "commodities"],
        },
        {
            "slug_suffix": "lithium-curve",
            "title": "Lithium: price discovery painful for marginal projects",
            "lede": "Spodumene contracts **reset**; only low-cost tonnes clear at spot.",
            "body_paragraphs": [
                "Battery-grade lithium chemicals remain under pressure from oversupply and slower EV penetration slopes. High-cost greenfield projects are delaying FIDs or seeking strategic partners.",
                "Long-term OEM offtake still anchors tier-one basin developers.",
            ],
            "tag_slugs": ["commodities", "m-a"],
        },
    ],
    "real-estate": [
        {
            "slug_suffix": "office-cbd",
            "title": "Office CBD: bifurcated flight to quality within cities",
            "lede": "Class A **trophy** prints still finance; B/C assets trade at wide cap rates.",
            "body_paragraphs": [
                "Leasing velocity is concentrating in newer, amenitized towers with strong transit access. Older vintage stock faces value impairment and higher capex to compete for tenants.",
                "Lender willingness to extend versus foreclose varies by bank and exposure concentration.",
            ],
            "tag_slugs": ["reits", "macro-rates"],
        },
        {
            "slug_suffix": "industrial-logistics",
            "title": "Industrial REITs: rent growth cools from double-digit highs",
            "lede": "Supply wave **markets-specific**; Sun Belt still leads net absorption.",
            "body_paragraphs": [
                "Logistics rent growth is moderating as new supply delivers in select markets, but replacement cost rent spreads remain positive in many Sun Belt corridors. E-commerce fulfillment footprints are optimizing rather than shrinking.",
                "Debt maturities in 2026–27 remain the watch item for highly levered subscale portfolios.",
            ],
            "tag_slugs": ["reits", "earnings"],
        },
        {
            "slug_suffix": "retail-necessity",
            "title": "Grocery-anchored retail: cap rates tighten on duration",
            "lede": "Necessity tenants **support** NOI stability; rent bumps tied to CPI.",
            "body_paragraphs": [
                "Open-air centers with grocery anchors continue to attract income buyers seeking CPI-linked bumps. Big-box shadow anchors remain a rollover risk where concepts consolidate.",
                "Tenant improvement packages are moderating from pandemic reopening peaks.",
            ],
            "tag_slugs": ["dividends", "macro-rates"],
        },
        {
            "slug_suffix": "apartment-supply",
            "title": "Multifamily supply: deliveries peak—rent growth goes negative in spots",
            "lede": "Sun Belt **lease-ups** compete; operators offer concessions.",
            "body_paragraphs": [
                "Apartment supply waves in Austin, Phoenix-style markets are pressuring effective rents via concessions. Coastal gateway markets show better balance with slower supply pipelines.",
                "Single-family rental operators are selectively pausing acquisitions as cap rates moved.",
            ],
            "tag_slugs": ["reits", "momentum"],
        },
        {
            "slug_suffix": "data-center-reits",
            "title": "Data center REITs: power availability screens the moat",
            "lede": "AI tenants **bid** for megawatt blocks; development yields attractive if land/power lock.",
            "body_paragraphs": [
                "Hyperscale leasing is compressing available powered shell in prime markets, supporting development spreads for operators with land banks and utility relationships. Financing costs remain the offset to NOI growth.",
                "Regulatory scrutiny on water use for cooling is rising in drought-prone regions.",
            ],
            "tag_slugs": ["data-centers", "reits"],
        },
    ],
    "utilities": [
        {
            "slug_suffix": "load-growth-ai",
            "title": "Grid load growth: data centers vs. efficiency gains",
            "lede": "IRPs revised **up** in several ISOs; transmission queues still clogged.",
            "body_paragraphs": [
                "Integrated utilities in high-growth load pockets are revising integrated resource plans upward for data center and industrial reshoring demand. Interconnection queues remain the practical gating item for new generation.",
                "Efficiency and distributed resources partially offset but do not negate bulk power needs.",
            ],
            "tag_slugs": ["utilities-power", "data-centers"],
        },
        {
            "slug_suffix": "gas-generation-bridge",
            "title": "Gas-fired generation: bridge fuel debates meet permitting reality",
            "lede": "Peakers and **CCGT** still win reliability bids despite ESG pressure.",
            "body_paragraphs": [
                "Reliability-driven regulators continue to approve combined-cycle additions where renewable intermittency stresses reserve margins. Environmental opposition lengthens timelines but rarely stops all projects.",
                "Commodity gas price pass-through mechanisms vary by jurisdiction and lag structure.",
            ],
            "tag_slugs": ["regulation", "commodities"],
        },
        {
            "slug_suffix": "renewables-ppa",
            "title": "Renewables PPAs: corporate offtake reprices with power curves",
            "lede": "Developer returns **tighter**; tax credit transferability helps capital stack.",
            "body_paragraphs": [
                "Corporate renewable procurement remains active but buyers are more price sensitive versus the sub-3% PPA era. IRA transferability is improving bankability for tax-equity constrained sponsors.",
                "Interconnection upgrade cost allocation disputes still blow up project returns.",
            ],
            "tag_slugs": ["macro-rates", "earnings"],
        },
        {
            "slug_suffix": "wildfire-oi",
            "title": "Wildfire risk: regulatory asset treatment still a stock driver",
            "lede": "California names trade **regulatory** outcomes as much as weather.",
            "body_paragraphs": [
                "Utility equities in high wildfire risk regions remain sensitive to legislative frameworks for cost recovery and asset hardening timelines. Grid hardening capex is defensible if allowed in rate base.",
                "Insurance availability for transmission line contractors influences project schedules.",
            ],
            "tag_slugs": ["regulation", "dividends"],
        },
        {
            "slug_suffix": "nuclear-renaissance",
            "title": "Nuclear restarts and SMR pilots: option value in regulated names",
            "lede": "Licenses and **fuel** supply chains years-long; sentiment can front-run fundamentals.",
            "body_paragraphs": [
                "Life extensions for existing nuclear fleets remain the near-term megawatt story while SMR designs work through licensing. Fuel conversion and HALEU supply chains are early-stage bottlenecks.",
                "Regulated ROE treatment of nuclear capex varies materially by commission.",
            ],
            "tag_slugs": ["product-cycle", "regulation"],
        },
    ],
}


from home.seed_news_extras import EXTRA_SECTOR_ARTICLES as _EXTRA_SECTOR_ARTICLES

for _slug_merge, _extra_list in _EXTRA_SECTOR_ARTICLES.items():
    SECTOR_ARTICLES[_slug_merge].extend(_extra_list)


def all_sector_slugs_covered() -> bool:
    from home.gics_sectors import GICS_SECTOR_SLUGS

    return set(SECTOR_ARTICLES.keys()) == set(GICS_SECTOR_SLUGS)
