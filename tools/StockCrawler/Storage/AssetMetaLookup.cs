using Alpaca.Markets;

namespace StockCrawler.Storage;

/// <summary>Optional Alpaca Trading API enrichment for <see cref="StockWriter"/>.</summary>
internal static class AssetMetaLookup
{
    public static async Task<StockUpsertMeta?> tryFetchAsync(
        IAlpacaTradingClient trading,
        string symbol,
        CancellationToken ct = default)
    {
        try {
            var a = await trading.GetAssetAsync(symbol, ct);
            return new StockUpsertMeta(
                string.IsNullOrWhiteSpace(a.Name) ? null : a.Name,
                formatExchange(a),
                a.Class.ToString(),
                Sector: null,
                Industry: null,
                Country: null);
        } catch (Exception ex) {
            Console.Error.WriteLine($"Asset lookup {symbol}: {ex.Message}");
            return null;
        }
    }

    private static string? formatExchange(IAsset a) {
        try {
            return a.Exchange.ToString();
        } catch {
            return null;
        }
    }
}
