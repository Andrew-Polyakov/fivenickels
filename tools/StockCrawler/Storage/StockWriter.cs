using Microsoft.Data.Sqlite;

namespace StockCrawler.Storage;

internal readonly record struct StockUpsertMeta(
    string? Name,
    string? Exchange,
    string? AssetClass,
    string? Sector,
    string? Industry,
    string? Country);

internal sealed class StockWriter
{
    private readonly SqliteConnection _connection;

    public StockWriter(LocalDatabase db) {
        _connection = db.getConnection();
    }

    /// <summary>
    /// Inserts or updates <c>stocks</c> for the shared SQLite DB used by the Trades backend.
    /// </summary>
    public void upsert(string symbol, DateTime nowUtc, StockUpsertMeta? meta = null) {
        var sym = symbol.Trim().ToUpperInvariant();
        var seen = formatUtc(nowUtc);
        var m = meta ?? default;
        using var cmd = _connection.CreateCommand();
        cmd.CommandText =
            """
            INSERT INTO stocks (
                symbol, name, exchange, asset_class, sector, industry, country,
                is_active, first_seen_utc, last_seen_utc
            ) VALUES (
                $sym, $name, $ex, $ac, $sec, $ind, $co,
                1, $seen, $seen2
            )
            ON CONFLICT(symbol) DO UPDATE SET
                last_seen_utc = excluded.last_seen_utc,
                name = COALESCE(excluded.name, stocks.name),
                exchange = COALESCE(excluded.exchange, stocks.exchange),
                asset_class = COALESCE(excluded.asset_class, stocks.asset_class),
                sector = COALESCE(excluded.sector, stocks.sector),
                industry = COALESCE(excluded.industry, stocks.industry),
                country = COALESCE(excluded.country, stocks.country),
                is_active = 1;
            """;
        cmd.Parameters.AddWithValue("$sym", sym);
        cmd.Parameters.AddWithValue("$name", (object?)m.Name ?? DBNull.Value);
        cmd.Parameters.AddWithValue("$ex", (object?)m.Exchange ?? DBNull.Value);
        cmd.Parameters.AddWithValue("$ac", (object?)m.AssetClass ?? DBNull.Value);
        cmd.Parameters.AddWithValue("$sec", (object?)m.Sector ?? DBNull.Value);
        cmd.Parameters.AddWithValue("$ind", (object?)m.Industry ?? DBNull.Value);
        cmd.Parameters.AddWithValue("$co", (object?)m.Country ?? DBNull.Value);
        cmd.Parameters.AddWithValue("$seen", seen);
        cmd.Parameters.AddWithValue("$seen2", seen);
        cmd.ExecuteNonQuery();
    }

    private static string formatUtc(DateTime utc) {
        return utc.ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ");
    }
}
