using StockCrawler.Patterns;
using StockCrawler.Storage;
using Alpaca.Markets;

namespace StockCrawler;

internal static class PatternsCommand
{
    public static async Task<int> runAsync(
        IReadOnlyList<string> tickers,
        string keyId,
        string keySecret,
        bool useLive,
        bool withBars)
    {
        var secret = new SecretKey(keyId, keySecret);
        IEnvironment alpca = useLive ? Environments.Live : Environments.Paper;
        var data = alpca.GetAlpacaDataClient(secret);
        var bars = (IHistoricalBarsClient<HistoricalBarsRequest>)(object)data;
        using var db = new LocalDatabase(LocalDatabase.getDefaultDbPath());
        db.initialize();
        var cache = new BarsRepo(db);
        var stockWriter = new StockWriter(db);
        var trading = alpca.GetAlpacaTradingClient(secret);
        var end = DateTime.UtcNow;
        var root = new PatternRootDto {
            AsOfUtc = end,
            WithBarsDebug = withBars
        };
        var runStart = DateTime.UtcNow;
        try {
            foreach (var sym in tickers) {
                var t = new PatternTickerDto { Symbol = sym, Timeframes = new TimeframeBundleDto() };
                var m1 = await getBarsCachedAsync(
                    cache,
                    bars,
                    sym,
                    "1Month",
                    new BarTimeFrame(1, BarTimeFrameUnit.Month),
                    end,
                    TimeSpan.FromDays(3650),
                    CancellationToken.None);
                var w1 = await getBarsCachedAsync(
                    cache,
                    bars,
                    sym,
                    "1Week",
                    BarTimeFrame.Week,
                    end,
                    TimeSpan.FromDays(365 * 3),
                    CancellationToken.None);
                var d1 = await getBarsCachedAsync(
                    cache,
                    bars,
                    sym,
                    "1Day",
                    new BarTimeFrame(1, BarTimeFrameUnit.Day),
                    end,
                    TimeSpan.FromDays(365),
                    CancellationToken.None);
                t.Timeframes!.Month1 = buildBlock(m1, withBars);
                t.Timeframes.Week1 = buildBlock(w1, withBars);
                t.Timeframes.Day1 = buildBlock(d1, withBars);
                t.LastPrice = d1.Count > 0 ? d1[^1].Close
                    : w1.Count > 0 ? w1[^1].Close
                    : m1.Count > 0 ? m1[^1].Close
                    : null;
                root.Tickers.Add(t);
                var meta = await AssetMetaLookup.tryFetchAsync(trading, sym);
                stockWriter.upsert(sym, end, meta);
            }
            var runId = PatternScanPersistence.insertScanRun(db, runStart, DateTime.UtcNow, tickers);
            foreach (var t in root.Tickers) {
                PatternScanPersistence.insertSetupFromPattern(db.getConnection(), runId, t);
            }
        } catch (Exception ex) {
            Console.Error.WriteLine(ex.ToString());
            return Exits.Api;
        }
        JsonOutput.writeToStdout(root);
        return 0;
    }

    private static async Task<List<OhlcvBar>> getBarsCachedAsync(
        BarsRepo cache,
        IHistoricalBarsClient<HistoricalBarsRequest> c,
        string symbol,
        string tfId,
        BarTimeFrame timeFrame,
        DateTime nowUtc,
        TimeSpan retention,
        CancellationToken ct)
    {
        var floor = nowUtc - retention;
        var stored = cache.getMaxTimeUtc(symbol, tfId);
        var fetchFrom = (stored is { } s && s > floor) ? s : floor;
        var fetchedCount = 0;
        if (fetchFrom < nowUtc) {
            var fetched = await fetchAllBarsAsync(c, symbol, fetchFrom, nowUtc, timeFrame, ct);
            fetchedCount = fetched.Count;
            if (fetched.Count > 0) {
                cache.upsertBars(symbol, tfId, fetched);
            }
        }
        _ = cache.prune(symbol, tfId, floor);
        Console.Error.WriteLine($"patterns-cache {symbol} {tfId}: fetched={fetchedCount}");
        return cache.readBars(symbol, tfId, floor);
    }

    private static async Task<List<OhlcvBar>> fetchAllBarsAsync(
        IHistoricalBarsClient<HistoricalBarsRequest> c,
        string symbol,
        DateTime from,
        DateTime to,
        BarTimeFrame timeFrame,
        CancellationToken ct)
    {
        var all = new List<IBar>();
        var first = new HistoricalBarsRequest(symbol, timeFrame, new Interval<DateTime>(from, to)) {
            // IEX is available on the free data plan; SIP needs a paid subscription.
            Feed = MarketDataFeed.Iex
        };
        string? next = null;
        for (;;) {
            var r = next == null ? first : first.WithPageToken(next);
            var page = await c.ListHistoricalBarsAsync(r, ct);
            all.AddRange(page.Items);
            if (string.IsNullOrEmpty(page.NextPageToken)) {
                break;
            }
            next = page.NextPageToken;
        }
        return all
            .OrderBy(b => b.TimeUtc)
            .Select(fromIbar)
            .ToList();
    }

    private static OhlcvBar fromIbar(IBar b) {
        return new OhlcvBar {
            TimeUtc = b.TimeUtc,
            Open = (double)b.Open,
            High = (double)b.High,
            Low = (double)b.Low,
            Close = (double)b.Close,
            Volume = (double)b.Volume
        };
    }

    private static TimeframeBlockDto? buildBlock(
        IReadOnlyList<OhlcvBar> b,
        bool withBars)
    {
        if (b.Count == 0) {
            return new TimeframeBlockDto {
                Trend = "range",
                Indicators = new IndicatorsJsonDto(),
            };
        }
        var close = b.Select(x => x.Close).ToList();
        var e20L = IndicatorMath.lastNonNull(IndicatorMath.ema(close, 20));
        var e50L = IndicatorMath.lastNonNull(IndicatorMath.ema(close, 50));
        var s200L = IndicatorMath.smaAt(close, 200);
        var aTr = IndicatorMath.atr14(b);
        var rsiL = IndicatorMath.rsi14(close);
        var (adx, dP, dM) = IndicatorMath.adx14(b);
        var eSl = IndicatorMath.ema20Slope10(close);
        var last0 = b[^1];
        var tren = Swings.trend(
            last0.Close,
            e20L, e50L, s200L, adx, eSl);
        var sh = Swings.swingHighs(b);
        var sl = Swings.swingLows(b);
        var atr0 = aTr is { } a0 ? a0 : 1.0;
        var levs = Swings.clusterLevels(sh, sl, atr0);
        var r20 = range20(b, 20, last0.Close, aTr);
        var cnd = lastCandle(last0, aTr);
        var block = new TimeframeBlockDto {
            Trend = tren,
            Indicators = new IndicatorsJsonDto {
                Ema20 = e20L, Ema50 = e50L, Sma200 = s200L, Ema20Slope10 = eSl,
                Atr14 = aTr, Rsi14 = rsiL, Adx14 = adx, DiPlus14 = dP, DiMinus14 = dM,
                LastVolZ20 = IndicatorMath.lastVolZ(b, 20)
            },
            SwingHighs = sh,
            SwingLows = sl,
            Levels = levs,
            Range20 = r20,
            LastCandle = cnd,
        };
        if (withBars) {
            block.Bars = b
                .Select(
                    b0 => new BarSlimJsonDto {
                        TimeUtc = b0.TimeUtc,
                        O = b0.Open, H = b0.High, L = b0.Low, C = b0.Close, V = b0.Volume
                    })
                .ToList();
        }
        return block;
    }

    private static RangeJsonDto? range20(IReadOnlyList<OhlcvBar> b, int n, double lastC, double? aTr) {
        if (b.Count < n) {
            return null;
        }
        var s = b.Skip(b.Count - n);
        var hi = s.Max(x => x.High);
        var lo = s.Min(x => x.Low);
        if (lastC < 1e-12) {
            return null;
        }
        var atr = aTr is { } t ? t : 1.0;
        return new RangeJsonDto {
            Lookback = n,
            High = hi,
            Low = lo,
            DistCloseToHighPct = 100.0 * (lastC - hi) / lastC,
            DistCloseToLowPct = 100.0 * (lastC - lo) / lastC,
            DistToHighAtr14 = aTr is { } t2 ? (lastC - hi) / t2 : null,
            DistToLowAtr14 = aTr is { } t3 ? (lastC - lo) / t3 : null
        };
    }

    private static LastCandleJsonDto lastCandle(OhlcvBar b, double? aTr) {
        var r = b.High - b.Low;
        var body = Math.Abs(b.Close - b.Open);
        var top = Math.Max(b.Close, b.Open);
        var bot = Math.Min(b.Close, b.Open);
        var uW = b.High - top;
        var lW = bot - b.Low;
        return new LastCandleJsonDto {
            TimeUtc = b.TimeUtc,
            Open = b.Open,
            High = b.High,
            Low = b.Low,
            Close = b.Close,
            BodyPctOfRange = r < 1e-12 ? null : body / r,
            UpperWickPctOfRange = r < 1e-12 ? null : uW / r,
            LowerWickPctOfRange = r < 1e-12 ? null : lW / r
        };
    }
}
