"""Additional seed articles merged at import in seed_news_data."""

from __future__ import annotations

EXTRA_SECTOR_ARTICLES: dict[str, list] = {
    "communication-services": [
        {
            "slug_suffix": "satellite-broadband-rural",
            "title": "LEO broadband: rural ARPU and subsidy risk",
            "lede": "**Low-orbit** capacity adds competition for fixed wireless incumbents.",
            "body_paragraphs": [
                "Low-Earth-orbit constellations are expanding coverage maps faster than fiber can reach exurbs. Churn and subsidy eligibility for rural households remain the swing factors for revenue quality.",
                "Regulators are watching spectrum sharing and debris rules—small headline risk but long-dated overhang for capex-heavy models.",
            ],
            "tag_slugs": ["regulation", "rates-curve", "volatility", "consumer-confidence"],
        },
        {
            "slug_suffix": "social-commerce-attribution",
            "title": "Social commerce: attribution gaps vs. last-click budgets",
            "lede": "Retail media **overlap** with creator payouts complicates ROAS math.",
            "body_paragraphs": [
                "Platforms are tightening attribution windows to prove incrementality to brand advertisers. Creator economy payouts and shop tabs compete for the same performance dollar.",
                "AI-driven creative testing is compressing cycle times for campaign launches—ops leverage for scaled advertisers.",
            ],
            "tag_slugs": ["retail-media", "ai-supply-chain", "momentum", "esg-flows"],
        },
        {
            "slug_suffix": "wireless-postpaid-netadds",
            "title": "Wireless: postpaid net adds hinge on switcher promos",
            "lede": "**Family-plan** pricing wars return when churn ticks up.",
            "body_paragraphs": [
                "Carriers are cycling through device promos and bill credits to defend postpaid bases. Cable MVNO bundles still move the needle for net port ratios in overlapping footprints.",
                "Tower and fiber co-location economics improve when traffic growth reaccelerates without another capex spike.",
            ],
            "tag_slugs": ["earnings", "china-demand", "volatility", "rates-curve"],
        },
    ],
    "consumer-discretionary": [
        {
            "slug_suffix": "cruise-booking-curve",
            "title": "Cruise lines: booking curve steepens into wave season",
            "lede": "**Onboard** spend and cabin mix offset ticket discounting.",
            "body_paragraphs": [
                "Forward booked position is tracking ahead of last year for several operators, with Caribbean itineraries leading. Fuel surcharges remain a pass-through but sentiment links to Brent moves.",
                "China outbound itineraries are still below 2019 mix for some brands—incremental upside if visa and flight capacity normalize.",
            ],
            "tag_slugs": ["consumer-confidence", "commodities", "china-demand", "volatility"],
        },
        {
            "slug_suffix": "apparel-inventory-clean",
            "title": "Apparel: inventory clean enough for selective restock",
            "lede": "Markdown risk **fades**; full-price sell-through the KPI into holidays.",
            "body_paragraphs": [
                "Brand houses that cleared excess units through off-price are seeing gross margin recovery as full-price channels reset. Denim and basics cycles remain shorter than luxury leather.",
                "Tariff chatter on Asian sourcing keeps buyers hedged with dual-country vendor maps.",
            ],
            "tag_slugs": ["supply-chain", "housing", "em-fx", "momentum"],
        },
        {
            "slug_suffix": "theme-parks-capex",
            "title": "Theme parks: capex waves tied to IP refresh cadence",
            "lede": "Gate yield **plus** per caps drive EBITDA when weather cooperates.",
            "body_paragraphs": [
                "New land openings create multi-year attendance step-functions but depress margins during ramp. Variable staffing models help smooth peak-day labor spikes.",
                "International park mix benefits when the dollar weakens—reported RevPAR can outpace domestic on translation alone.",
            ],
            "tag_slugs": ["product-cycle", "consumer-confidence", "rates-curve", "buybacks"],
        },
    ],
    "consumer-staples": [
        {
            "slug_suffix": "snacking-glucose-narrative",
            "title": "Snacking category: GLP-1 headlines vs. scanner data",
            "lede": "Measured volumes **still** mixed by channel; private label chips resilient.",
            "body_paragraphs": [
                "IRI-style scanner sets show uneven category impact from anti-obesity drug narratives—convenience and club channels diverge. Investors are rewarding brands with portfolio breadth into better-for-you.",
                "Input costs for oils and sweeteners have normalized from peaks, giving a window for promo rationalization.",
            ],
            "tag_slugs": ["consumer-confidence", "clinical-fda", "commodities", "volatility"],
        },
        {
            "slug_suffix": "coffee-hedge-roll",
            "title": "Coffee: hedge rolls and Brazil crop updates move margins",
            "lede": "**Arabica** curve backwardation helps roasters with layered hedges.",
            "body_paragraphs": [
                "Roasters with disciplined hedge books are lapping easier green coffee compares. RTD shelf space competition keeps marketing spend elevated.",
                "Emerging-market consumer growth for instant formats still offsets mature-market decaf trends for global portfolios.",
            ],
            "tag_slugs": ["commodities", "em-fx", "rates-curve", "earnings"],
        },
        {
            "slug_suffix": "retailer-media-networks",
            "title": "Retailer media networks: CPG pays for on-site search lift",
            "lede": "High-margin **ad** revenue offsets thin grocery retail EBIT.",
            "body_paragraphs": [
                "Kroger-type networks monetize search and sponsored placements with minimal incremental capex. Data clean rooms with CPG partners deepen targeting but invite privacy scrutiny.",
                "Self-checkout shrink remains an EBIT drag that media upside only partly offsets.",
            ],
            "tag_slugs": ["retail-media", "regulation", "ai-supply-chain", "momentum"],
        },
    ],
    "energy": [
        {
            "slug_suffix": "frac-spread-nam",
            "title": "Frac spreads: North America pressure pumping utilization ticks up",
            "lede": "**Fleet** reactivations lag spot crude by a quarter or two.",
            "body_paragraphs": [
                "Pressure pumping spreads are improving from trough levels as operators high-grade fleets and idle low-spec spreads. Sand logistics remain localized bottlenecks in certain basins.",
                "E&P customers still prioritize returns over activity growth—service pricing power is real but capped.",
            ],
            "tag_slugs": ["oil-services", "commodities", "volatility", "earnings"],
        },
        {
            "slug_suffix": "carbon-credit-vol",
            "title": "Carbon credits: voluntary market liquidity and headline risk",
            "lede": "Offsets **trade thin**; quality differentiation drives realized prices.",
            "body_paragraphs": [
                "Corporate net-zero pledges created demand for voluntary credits, but verification standards fragmentation keeps bid/offer wide. Regulatory linkage to compliance markets could re-rate the complex.",
                "Energy majors use credits tactically while focusing capex on core hydrocarbons and power marketing.",
            ],
            "tag_slugs": ["esg-flows", "regulation", "volatility", "macro-rates"],
        },
        {
            "slug_suffix": "asia-lng-imports",
            "title": "Asia LNG imports: JKM sensitivity to industrial restarts",
            "lede": "**China** power demand and Japan restarts set the marginal bid.",
            "body_paragraphs": [
                "North Asian buyers are managing storage inventories cautiously after prior winters’ spikes. Industrial gas demand in China remains the high-beta swing for marginal cargo pricing.",
                "New US liquefaction trains add supply but offtake contracts skew toward portfolio players, not pure spot.",
            ],
            "tag_slugs": ["china-demand", "commodities", "rates-curve", "em-fx"],
        },
    ],
    "financials": [
        {
            "slug_suffix": "cre-office-loss-severity",
            "title": "CRE office: loss severity still idiosyncratic by bank",
            "lede": "Reserve builds **slow**; criticized loans migrate before charge-offs spike.",
            "body_paragraphs": [
                "Money-center banks with diversified books are reserving through the cycle; regional names with concentrated office exposure remain the watch list. Appraisal resets lag market clearing by quarters.",
                "Agency MBS and consumer books offset cyclical noise in headline charge-off rates for diversified franchises.",
            ],
            "tag_slugs": ["banks-credit", "housing", "volatility", "macro-rates"],
        },
        {
            "slug_suffix": "fintech-deposit-beta",
            "title": "Fintech deposits: beta catches up with money-market yields",
            "lede": "**Cash-sort** accounts compress NIM unless interchange scales.",
            "body_paragraphs": [
                "Digital banks that grew deposits through high teaser yields are repricing to defend balances as MMFs hover near cycle highs. Interchange and subscription fees must carry more of the P&L.",
                "Regulatory capital treatment for synthetic holds remains a modeling footnote for some platforms.",
            ],
            "tag_slugs": ["rates-curve", "regulation", "momentum", "consumer-confidence"],
        },
        {
            "slug_suffix": "life-ins-spread-income",
            "title": "Life insurers: spread income improves with long rates",
            "lede": "DAC unlocks and **reserve** sensitivity still dominate EPS noise.",
            "body_paragraphs": [
                "Higher long rates help assumed investment returns on new business and reduce reserve strain for some blocks. Variable annuity hedging costs remain volatile quarter to quarter.",
                "Japan dollar funding costs matter for global lifers with yen-denominated liabilities.",
            ],
            "tag_slugs": ["insurance", "rates-curve", "em-fx", "earnings"],
        },
    ],
    "health-care": [
        {
            "slug_suffix": "payer-mlr-politics",
            "title": "Managed care: MLR politics into election cycle",
            "lede": "**Medicare Advantage** rate chatter moves stocks faster than fundamentals.",
            "body_paragraphs": [
                "Supplemental benefits and coding intensity remain under political scrutiny for MA plans. Commercial medical cost trend is moderating but still above pre-pandemic norms in some markets.",
                "Vertical integration with providers creates synergy narratives and antitrust headline risk simultaneously.",
            ],
            "tag_slugs": ["regulation", "consumer-confidence", "volatility", "earnings"],
        },
        {
            "slug_suffix": "cdmo-china-geopol",
            "title": "CDMOs: China geopolitics and dual-sourcing audits",
            "lede": "Site inspections **drive** backlog shifts toward India and Europe.",
            "body_paragraphs": [
                "Western sponsors are dual-sourcing more peptide and ADC work to reduce single-country concentration. Travel and inspection backlogs still elongate tech transfer timelines.",
                "CapEx for large-scale bioreactors remains lumpy quarter to quarter.",
            ],
            "tag_slugs": ["china-demand", "supply-chain", "clinical-fda", "ai-supply-chain"],
        },
        {
            "slug_suffix": "dme-reimbursement",
            "title": "DME suppliers: competitive bidding and reimbursement resets",
            "lede": "CMS schedules **set** multiple-year revenue paths; stocks gap on headlines.",
            "body_paragraphs": [
                "Durable medical equipment names trade reimbursement schedules as much as volume. Competitive bidding rounds can reset market share abruptly among surviving bidders.",
                "Consolidation into scaled platforms continues as smaller suppliers exit.",
            ],
            "tag_slugs": ["regulation", "rates-curve", "m-a", "dividends"],
        },
    ],
    "industrials": [
        {
            "slug_suffix": "grid-equipment-backlog",
            "title": "Grid equipment: transformer backlog stretches lead times",
            "lede": "**HV** gear lead times support pricing for qualified vendors.",
            "body_paragraphs": [
                "Utilities and IPPs are competing for high-voltage transformer slots as interconnect queues clear in pockets. Domestic content preferences in incentive programs add routing complexity.",
                "Copper and core steel inputs still swing quoted delivery dates quarter to quarter.",
            ],
            "tag_slugs": ["utilities-power", "supply-chain", "commodities", "rates-curve"],
        },
        {
            "slug_suffix": "ag-equipment-dealer",
            "title": "Ag equipment: dealer inventories lean into planting",
            "lede": "Row-crop **margins** set farmer willingness to upgrade fleets.",
            "body_paragraphs": [
                "North American large ag equipment demand tracks corn and soybean margin proxies with a lag. Precision ag attach rates support ASP even when unit volumes flatten.",
                "Brazil farmer economics remain a swing factor for global combine demand.",
            ],
            "tag_slugs": ["commodities", "em-fx", "consumer-confidence", "product-cycle"],
        },
        {
            "slug_suffix": "water-infra-muni",
            "title": "Water infrastructure: muni funding and lead pipe programs",
            "lede": "Federal grants **blend** with rate-base cases at utilities.",
            "body_paragraphs": [
                "Lead service line replacement mandates create multi-year project pipelines for pipe and valve vendors. Municipal funding mixes grants with user charges—timing varies by city credit.",
                "Private water operators compete for O&M contracts where risk transfer is priced fairly.",
            ],
            "tag_slugs": ["regulation", "esg-flows", "housing", "earnings"],
        },
    ],
    "information-technology": [
        {
            "slug_suffix": "edge-inference-silicon",
            "title": "Edge inference: silicon diversity beyond cloud GPUs",
            "lede": "**NPU** attach in PCs and phones shifts TAM for low-power accelerators.",
            "body_paragraphs": [
                "On-device models are driving NPU marketing wars among handset OEMs. Edge silicon vendors compete on perf-per-watt and software stacks rather than raw flops alone.",
                "Enterprise edge gateways for vision and quality inspection see pilot-to-production elongation.",
            ],
            "tag_slugs": ["ai-supply-chain", "product-cycle", "volatility", "momentum"],
        },
        {
            "slug_suffix": "database-postgres-wave",
            "title": "Databases: Postgres-compatible engines win ISV mindshare",
            "lede": "Wire-protocol **compat** lowers switching costs; storage separation trends.",
            "body_paragraphs": [
                "Cloud hyperscalers and independents both ship Postgres wire-compatible services to capture migrations off legacy commercial databases. Disaggregated storage/compute improves elasticity economics.",
                "License compliance audits still create vendor concentration in regulated industries.",
            ],
            "tag_slugs": ["data-centers", "momentum", "rates-curve", "buybacks"],
        },
        {
            "slug_suffix": "fabless-china-revshare",
            "title": "Fabless semis: China revenue share and export controls",
            "lede": "Advanced-node **ship** restrictions reshape regional revenue mix.",
            "body_paragraphs": [
                "Leading-edge smartphone AP vendors navigate export control lists that move with geopolitics. Mature-node consumer and auto exposure in China remains large but lower ASP.",
                "Inventory digestion in Android chains is still the near-term unit headwind.",
            ],
            "tag_slugs": ["china-demand", "regulation", "supply-chain", "volatility"],
        },
    ],
    "materials": [
        {
            "slug_suffix": "ag-chem-channel",
            "title": "Ag chem: channel inventories and generic pricing pressure",
            "lede": "Glyphosate **generic** oversupply still weighs on realized pricing.",
            "body_paragraphs": [
                "North American distributor inventories normalized from peak, but generic herbicide pricing remains competitive globally. Premium seed traits still defend margin for integrated seed/chem stacks.",
                "Brazil farmer credit availability sets the swing for pre-season orders.",
            ],
            "tag_slugs": ["commodities", "em-fx", "supply-chain", "earnings"],
        },
        {
            "slug_suffix": "rare-earths-separation",
            "title": "Rare earths: separation capacity outside China still scarce",
            "lede": "Magnet **feedstocks** and recycling projects attract strategic capital.",
            "body_paragraphs": [
                "Western separation and metal projects remain bottlenecked by permitting and financing. Auto OEMs are signing offtake MOUs to secure NdPr exposure for EV traction motors.",
                "Recycling economics improve with magnet collection scale but remain single-digit supply for years.",
            ],
            "tag_slugs": ["china-demand", "esg-flows", "regulation", "m-a"],
        },
        {
            "slug_suffix": "cement-decarb-fuels",
            "title": "Cement decarb: alternative fuels and clinker substitution",
            "lede": "EU carbon costs **push** fuel switching faster than other regions.",
            "body_paragraphs": [
                "Kiln fuel mixes shifting to waste-derived fuels lower CO2 intensity but raise operational complexity. SCM blends reduce clinker factor where standards allow.",
                "US infrastructure demand supports volumes even as housing starts soften.",
            ],
            "tag_slugs": ["esg-flows", "housing", "commodities", "regulation"],
        },
    ],
    "real-estate": [
        {
            "slug_suffix": "life-science-lab-rent",
            "title": "Life science lab: rent growth normalizes post boom",
            "lede": "Sublease **space** clears slowly; TI packages still rich in top clusters.",
            "body_paragraphs": [
                "Biotech funding winter pushed sublease listings higher in Boston and San Diego corridors. Landlords with flexible lab shells are capturing tenant improvements amortized over longer leases.",
                "Big-pharma net absorption remains a stabilizer in mixed-use campuses.",
            ],
            "tag_slugs": ["reits", "rates-curve", "clinical-fda", "volatility"],
        },
        {
            "slug_suffix": "strip-centers-ev-charging",
            "title": "Strip centers: EV charging as traffic driver and capex line",
            "lede": "Utility **make-ready** cost allocation still negotiates site by site.",
            "body_paragraphs": [
                "Open-air retail owners are partnering with charge point operators to monetize parking fields. Utility upgrade cost pass-through varies by state tariff rules.",
                "Grocery anchors still set credit quality for smaller shop tenants.",
            ],
            "tag_slugs": ["utilities-power", "consumer-confidence", "housing", "retail-media"],
        },
        {
            "slug_suffix": "lodging-revpar-china",
            "title": "Lodging REITs: RevPAR mix tilts with inbound China travel",
            "lede": "Urban **luxury** lags resort in some gateways; group calendar improving.",
            "body_paragraphs": [
                "Group and convention calendars are rebuilding in major US cities, supporting ADR even as occupancy lags 2019 peaks in a few markets. International inbound mix helps coastal gateways most.",
                "Labor costs per occupied room remain above pre-pandemic norms.",
            ],
            "tag_slugs": ["china-demand", "reits", "consumer-confidence", "em-fx"],
        },
    ],
    "utilities": [
        {
            "slug_suffix": "battery-storage-irr",
            "title": "Utility-scale storage: IRRs hinge on stacked revenue",
            "lede": "**Ancillary** services and tolling contracts layer on energy arbitrage.",
            "body_paragraphs": [
                "Four-hour lithium-ion projects bid into capacity, ancillary services, and wholesale arb with region-specific revenue stacks. Interconnection upgrade cost allocation can make or break project FIDs.",
                "Tax credit adders for domestic content are still being interpreted in procurement.",
            ],
            "tag_slugs": ["utilities-power", "rates-curve", "esg-flows", "regulation"],
        },
        {
            "slug_suffix": "water-utility-rates",
            "title": "Water utilities: rate cases lag inflation but stay constructive",
            "lede": "Allowed **ROE** bands and capital trackers support dividend growth.",
            "body_paragraphs": [
                "Investor-owned water names continue to file constructive rate cases with capital trackers for lead replacement and treatment upgrades. Political sensitivity on bills caps how fast revenue can move.",
                "M&A roll-ups of small municipal systems still provide bolt-on growth.",
            ],
            "tag_slugs": ["dividends", "housing", "regulation", "consumer-confidence"],
        },
        {
            "slug_suffix": "storm-hardening-oandm",
            "title": "Storm hardening: O&M vs. capitalized grid spend",
            "lede": "Rider mechanisms **vary**; commissions balance bills vs. reliability scores.",
            "body_paragraphs": [
                "Major storms keep pushing hardening capex into rate base with rider recovery in several jurisdictions. O&M vegetation management spend competes for the same customer bill headroom.",
                "Undergrounding feeders remains expensive—targeted tree wire and sectionalizing devices are partial substitutes.",
            ],
            "tag_slugs": ["insurance", "utilities-power", "volatility", "rates-curve"],
        },
    ],
}
