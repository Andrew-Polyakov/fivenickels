using StockCrawler.News;
using Alpaca.Markets;

namespace StockCrawler;

/// <summary>Emits one JSON: Alpaca snapshots + news per ticker. Web search is not performed here.</summary>
internal static class NewsCommand
{
    public static async Task<int> runAsync(IReadOnlyList<string> tickers, string keyId, string keySecret, bool useLive) {
        var secret = new SecretKey(keyId, keySecret);
        IEnvironment alpca = useLive ? Environments.Live : Environments.Paper;
        var client = alpca.GetAlpacaDataClient(secret);
        var dto = new RootDto {
            AsOfUtc = DateTime.UtcNow,
            Mode = "news",
            Tickers = new List<TickerBlockDto>()
        };
        try {
            var fromNews = DateTime.UtcNow.AddHours(-24);
            var toNews = DateTime.UtcNow;
            var newsRequest = new NewsArticlesRequest(tickers) {
                TimeInterval = new Interval<DateTime>(fromNews, toNews),
                SortDirection = SortDirection.Descending
            };
            IPage<INewsArticle>? newsPage = null;
            try {
                newsPage = await client.ListNewsArticlesAsync(newsRequest);
            } catch (Exception ex) {
                Console.Error.WriteLine("News API warning: " + ex.Message);
            }

            var bySymbolHeadlines = groupNewsBySymbol(tickers, newsPage);
            var snapRequest = new LatestMarketDataListRequest(tickers);
            IReadOnlyDictionary<string, ISnapshot> snaps;
            try {
                snaps = await client.ListSnapshotsAsync(snapRequest);
            } catch (Exception ex) {
                Console.Error.WriteLine("Snapshot API: " + ex.Message);
                return Exits.Api;
            }

            foreach (var sym in tickers) {
                snaps.TryGetValue(sym, out var snap);
                bySymbolHeadlines.TryGetValue(sym, out var headlines);
                var block = buildTickerBlock(sym, snap, headlines);
                dto.Tickers.Add(block);
            }
        } catch (Exception ex) {
            Console.Error.WriteLine(ex.ToString());
            return Exits.Api;
        }

        JsonOutput.writeToStdout(dto);
        return 0;
    }

    private static IReadOnlyDictionary<string, List<NewsLineDto>> groupNewsBySymbol(
        IReadOnlyList<string> tickers,
        IPage<INewsArticle>? page)
    {
        var result = new Dictionary<string, List<NewsLineDto>>(StringComparer.OrdinalIgnoreCase);
        foreach (var t in tickers) {
            result[t] = new List<NewsLineDto>();
        }

        if (page == null) {
            return result;
        }

        foreach (var a in page.Items) {
            var symbols = a.Symbols ?? Array.Empty<String>();
            foreach (var t in tickers) {
                if (symbols.Any(s => string.Equals(s, t, StringComparison.OrdinalIgnoreCase))
                    && result[t].Count < 5) {
                    result[t].Add(new NewsLineDto {
                        Headline = a.Headline,
                        CreatedAtUtc = a.CreatedAtUtc
                    });
                }
            }
        }
        return result;
    }

    private static TickerBlockDto buildTickerBlock(
        string symbol,
        ISnapshot? snap,
        IReadOnlyList<NewsLineDto>? headlines)
    {
        decimal? last = null;
        decimal? prevClose = null;
        decimal? pct = null;
        decimal? vol = null;
        if (snap != null) {
            if (snap.CurrentDailyBar is { } cdb) {
                last = cdb.Close;
                vol = cdb.Volume;
            }
            if (snap.Trade is { } tr) {
                last ??= tr.Price;
            }
            if (snap.PreviousDailyBar is { } pdb) {
                prevClose = pdb.Close;
            }
            if (last is { } lp && prevClose is { } pc && pc != 0) {
                pct = 100m * (lp - pc) / pc;
            }
        }

        return new TickerBlockDto {
            Symbol = symbol,
            LastPrice = last,
            PreviousClose = prevClose,
            DayVolume = vol,
            PercentChange = pct,
            AlpacNews = headlines?.Take(3).ToList() ?? new List<NewsLineDto>(),
            WebHints = new List<WebHintDto>()
        };
    }
}
