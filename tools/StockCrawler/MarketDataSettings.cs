using Alpaca.Markets;

namespace StockCrawler;

/// <summary>Reads <c>ALPACA_BARS_FEED</c> (iex, sip, boats, overnight) for bars and snapshots.</summary>
internal static class MarketDataSettings
{
    public static MarketDataFeed BarsFeedFromEnvironment()
    {
        var raw = (Environment.GetEnvironmentVariable("ALPACA_BARS_FEED") ?? "iex").Trim().ToLowerInvariant();
        if (string.IsNullOrEmpty(raw)) {
            raw = "iex";
        }
        return raw switch {
            "sip" => MarketDataFeed.Sip,
            // boats / overnight: pass through FeedId for JSON; SDK may not expose enum members yet.
            _ => MarketDataFeed.Iex,
        };
    }

    public static string FeedIdFromEnvironment() {
        var raw = (Environment.GetEnvironmentVariable("ALPACA_BARS_FEED") ?? "iex").Trim().ToLowerInvariant();
        if (string.IsNullOrEmpty(raw)) {
            return "iex";
        }
        return raw is "sip" or "iex" or "boats" or "overnight" ? raw : "iex";
    }

    public static string FeedId(MarketDataFeed feed) {
        return feed switch {
            MarketDataFeed.Sip => "sip",
            _ => "iex",
        };
    }
}
