using Npgsql;
using NpgsqlTypes;
using StockCrawler.Patterns;

namespace StockCrawler.Storage;

internal sealed class BarsRepo
{
    private readonly NpgsqlConnection connection;

    public BarsRepo(LocalDatabase db) {
        connection = db.getConnection();
    }

    public DateTime? getMaxTimeUtc(string symbol, string timeframe) {
        using var cmd = connection.CreateCommand();
        cmd.CommandText =
            """
            SELECT max(time_utc)
            FROM bars
            WHERE symbol = @s AND timeframe = @tf;
            """;
        cmd.Parameters.AddWithValue("@s", symbol);
        cmd.Parameters.AddWithValue("@tf", timeframe);
        var raw = cmd.ExecuteScalar();
        if (raw is null || raw is DBNull) {
            return null;
        }
        if (DateTime.TryParse(raw.ToString(), out var dt)) {
            return DateTime.SpecifyKind(dt, DateTimeKind.Utc);
        }
        return null;
    }

    public void upsertBars(string symbol, string timeframe, IEnumerable<OhlcvBar> bars) {
        using var tx = connection.BeginTransaction();
        using var cmd = connection.CreateCommand();
        cmd.Transaction = tx;
        cmd.CommandText =
            """
            INSERT INTO bars (
                symbol, timeframe, time_utc, open, high, low, close, volume
            ) VALUES (
                @s, @tf, @t, @o, @h, @l, @c, @v
            )
            ON CONFLICT (symbol, timeframe, time_utc) DO UPDATE SET
                open = EXCLUDED.open,
                high = EXCLUDED.high,
                low = EXCLUDED.low,
                close = EXCLUDED.close,
                volume = EXCLUDED.volume;
            """;
        var pS = cmd.Parameters.Add("@s", NpgsqlDbType.Text);
        var pTf = cmd.Parameters.Add("@tf", NpgsqlDbType.Text);
        var pT = cmd.Parameters.Add("@t", NpgsqlDbType.Text);
        var pO = cmd.Parameters.Add("@o", NpgsqlDbType.Double);
        var pH = cmd.Parameters.Add("@h", NpgsqlDbType.Double);
        var pL = cmd.Parameters.Add("@l", NpgsqlDbType.Double);
        var pC = cmd.Parameters.Add("@c", NpgsqlDbType.Double);
        var pV = cmd.Parameters.Add("@v", NpgsqlDbType.Double);

        pS.Value = symbol;
        pTf.Value = timeframe;
        foreach (var b in bars) {
            pT.Value = b.TimeUtc.ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ");
            pO.Value = b.Open;
            pH.Value = b.High;
            pL.Value = b.Low;
            pC.Value = b.Close;
            pV.Value = b.Volume;
            cmd.ExecuteNonQuery();
        }
        tx.Commit();
    }

    public List<OhlcvBar> readBars(string symbol, string timeframe, DateTime fromUtc) {
        using var cmd = connection.CreateCommand();
        cmd.CommandText =
            """
            SELECT time_utc, open, high, low, close, volume
            FROM bars
            WHERE symbol = @s AND timeframe = @tf AND time_utc >= @from
            ORDER BY time_utc ASC;
            """;
        cmd.Parameters.AddWithValue("@s", symbol);
        cmd.Parameters.AddWithValue("@tf", timeframe);
        cmd.Parameters.AddWithValue("@from", fromUtc.ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ"));
        var outBars = new List<OhlcvBar>();
        using var rd = cmd.ExecuteReader();
        while (rd.Read()) {
            var tRaw = rd.GetString(0);
            if (!DateTime.TryParse(tRaw, out var t)) {
                continue;
            }
            outBars.Add(
                new OhlcvBar {
                    TimeUtc = DateTime.SpecifyKind(t, DateTimeKind.Utc),
                    Open = rd.GetDouble(1),
                    High = rd.GetDouble(2),
                    Low = rd.GetDouble(3),
                    Close = rd.GetDouble(4),
                    Volume = rd.GetDouble(5)
                });
        }
        return outBars;
    }

    public int prune(string symbol, string timeframe, DateTime beforeUtc) {
        using var cmd = connection.CreateCommand();
        cmd.CommandText =
            """
            DELETE FROM bars
            WHERE symbol = @s AND timeframe = @tf AND time_utc < @before;
            """;
        cmd.Parameters.AddWithValue("@s", symbol);
        cmd.Parameters.AddWithValue("@tf", timeframe);
        cmd.Parameters.AddWithValue("@before", beforeUtc.ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ"));
        return cmd.ExecuteNonQuery();
    }
}
