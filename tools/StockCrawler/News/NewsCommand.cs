using StockCrawler.News;
using StockCrawler.Storage;
using Alpaca.Markets;

namespace StockCrawler;

/// <summary>Emits one JSON: Alpaca snapshots + news per ticker. Web search is not performed here.</summary>
internal static class NewsCommand
{
    private const int MaxNewsItemsPerSymbol = 5;
    private const int MaxJsonNewsLines = 2;
    private const int MaxJsonContentChars = 4000;

    private static readonly HashSet<string> SemiconductorSymbols = new(StringComparer.OrdinalIgnoreCase) {
        "TSM", "SNDK", "ASML", "NVDA"
    };

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
                SortDirection = SortDirection.Descending,
                SendFullContentForItems = true,
                ExcludeItemsWithoutContent = false
            };
            newsRequest.Pagination.Size = 50;
            IPage<INewsArticle>? newsPage = null;
            try {
                newsPage = await client.ListNewsArticlesAsync(newsRequest);
            } catch (Exception ex) {
                Console.Error.WriteLine("News API warning: " + ex.Message);
            }

            var bySymbolHeadlines = groupNewsBySymbol(tickers, newsPage);
            var crawlUtc = DateTime.UtcNow;
            using var stockDb = new LocalDatabase(LocalDatabase.getDefaultConnectionString());
            stockDb.initialize();
            new NewsWriter().upsert(stockDb, newsPage, tickers, crawlUtc);

            var snapRequest = new LatestMarketDataListRequest(tickers);
            IReadOnlyDictionary<string, ISnapshot> snaps;
            try {
                snaps = await client.ListSnapshotsAsync(snapRequest);
            } catch (Exception ex) {
                Console.Error.WriteLine("Snapshot API: " + ex.Message);
                return Exits.Api;
            }

            var stockWriter = new StockWriter(stockDb);
            var trading = alpca.GetAlpacaTradingClient(secret);

            foreach (var sym in tickers) {
                snaps.TryGetValue(sym, out var snap);
                bySymbolHeadlines.TryGetValue(sym, out var headlines);
                var block = buildTickerBlock(sym, snap, headlines);
                dto.Tickers.Add(block);
                var meta = await AssetMetaLookup.tryFetchAsync(trading, sym);
                stockWriter.upsert(sym, crawlUtc, meta);
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
                    && result[t].Count < MaxNewsItemsPerSymbol) {
                    result[t].Add(mapArticle(t, a));
                }
            }
        }
        return result;
    }

    private static NewsLineDto mapArticle(string matchedTicker, INewsArticle a) {
        var src = a.Source?.ToString() ?? "";
        var symList = (a.Symbols ?? Array.Empty<string>())
            .Select(s => s.ToUpperInvariant())
            .Distinct()
            .ToList();
        return new NewsLineDto {
            Headline = a.Headline,
            CreatedAtUtc = a.CreatedAtUtc,
            Summary = string.IsNullOrEmpty(a.Summary) ? null : a.Summary,
            Content = string.IsNullOrEmpty(a.Content)
                ? null
                : NewsText.stripHtmlTruncate(a.Content, MaxJsonContentChars),
            Source = string.IsNullOrEmpty(src) ? null : src,
            Url = a.ArticleUrl?.ToString(),
            Symbols = symList,
            Tags = buildTags(matchedTicker, symList, src)
        };
    }

    private static List<string> buildTags(
        string matchedTicker,
        IReadOnlyList<string> symbolUpper,
        string sourceStr)
    {
        var tags = new List<string>();
        if (SemiconductorSymbols.Contains(matchedTicker)) {
            tags.Add("semiconductor");
        }
        foreach (var s in symbolUpper) {
            if (!tags.Contains(s, StringComparer.OrdinalIgnoreCase)) {
                tags.Add(s);
            }
        }
        var slug = sourceSlug(sourceStr);
        if (!string.IsNullOrEmpty(slug)
            && !tags.Contains(slug, StringComparer.OrdinalIgnoreCase)) {
            tags.Add(slug);
        }
        return tags;
    }

    private static string sourceSlug(string source) {
        if (string.IsNullOrWhiteSpace(source)) {
            return "";
        }
        var lower = source.Trim().ToLowerInvariant();
        var chars = lower.Select(c => char.IsLetterOrDigit(c) ? c : '_').ToArray();
        var compact = new string(chars);
        while (compact.Contains("__", StringComparison.Ordinal)) {
            compact = compact.Replace("__", "_", StringComparison.Ordinal);
        }
        return compact.Trim('_');
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
            AlpacNews = headlines?.Take(MaxJsonNewsLines).ToList() ?? new List<NewsLineDto>(),
            WebHints = new List<WebHintDto>()
        };
    }
}
