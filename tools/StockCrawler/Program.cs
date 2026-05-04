using StockCrawler.News;
using StockCrawler.Storage;

namespace StockCrawler;

/// <summary>StockCrawler: <c>news</c> (default) = snapshots + news JSON; <c>patterns</c> = multi-TF indicators JSON; <c>init-db</c> = create tables in the Postgres crawler DB and exit.</summary>
internal static class Program
{
    public static async Task<int> Main(string[] args) {
        if (args.Length == 0) {
            printUsage();
            return Exits.BadArgs;
        }
        // `init-db` creates the Postgres schema without any Alpaca API call —
        // used by scripts/migrate-crawler-to-postgres.py and first-time setup.
        if (args.Length >= 1 && string.Equals(args[0], "init-db", StringComparison.OrdinalIgnoreCase)) {
            using var db = new LocalDatabase(LocalDatabase.getDefaultConnectionString());
            db.initialize();
            Console.Error.WriteLine("StockCrawler schema initialized.");
            return 0;
        }
        if (!tryParseLine(args, out var verb, out var tickers, out var withBars) || tickers.Count == 0) {
            printUsage();
            return Exits.BadArgs;
        }
        var (keyId, keySecret, useLive) = Credentials.load();
        if (string.IsNullOrWhiteSpace(keyId) || string.IsNullOrWhiteSpace(keySecret)) {
            Console.Error.WriteLine(
                "Missing APCA_API_KEY_ID / APCA_API_SECRET_KEY (or ALPACA_*). " +
                "Put them in trades/.apca or .env in the repository root, or in the process environment. " +
                "ALPACA_ENV=live|paper in that file to match your key type. See .env.example.");
            return Exits.BadEnv;
        }
        if (string.Equals(verb, "patterns", StringComparison.OrdinalIgnoreCase)) {
            return await PatternsCommand.runAsync(
                tickers, keyId, keySecret, useLive, withBars);
        }
        return await NewsCommand.runAsync(
            tickers, keyId, keySecret, useLive);
    }

    private static void printUsage() {
        Console.Error.WriteLine(
            "Usage: StockCrawler [news] TICKER [TICKER ...]\n" +
            "   or: StockCrawler patterns [--with-bars] TICKER [TICKER ...]\n" +
            "   or: StockCrawler init-db   (create Postgres schema and exit)\n" +
            "Credentials: file first — walk up for .apca, alpacacredentials, or .env; " +
            "APCA_API_KEY_ID / APCA_API_SECRET_KEY (or ALPACA_*) in environment. See .env.example.");
    }

    private static bool tryParseLine(
        IReadOnlyList<string> a,
        out string verb,
        out List<string> tickers,
        out bool withBars) {
        verb = "news";
        tickers = new List<string>();
        withBars = false;
        if (a.Count == 0) {
            return false;
        }
        var s = 0;
        if (a[0] is { } t0) {
            if (string.Equals(t0, "news", StringComparison.OrdinalIgnoreCase)
                || string.Equals(t0, "patterns", StringComparison.OrdinalIgnoreCase)) {
                verb = t0.ToLowerInvariant() == "patterns" ? "patterns" : "news";
                s = 1;
            } else {
                s = 0;
            }
        }
        for (var i = s; i < a.Count; i++) {
            if (a[i] == null) {
                continue;
            }
            if (string.Equals(a[i], "--with-bars", StringComparison.Ordinal)) {
                withBars = true;
            } else if (a[i].Length > 0) {
                tickers.Add(a[i]!.Trim().ToUpperInvariant());
            }
        }
        tickers = tickers
            .Where(x => x.Length > 0)
            .Distinct()
            .ToList();
        if (string.Equals(verb, "news", StringComparison.OrdinalIgnoreCase)
            && (withBars)) {
            withBars = false;
        }
        return true;
    }
}
