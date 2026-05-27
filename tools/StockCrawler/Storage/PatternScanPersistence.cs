using Npgsql;
using StockCrawler.Patterns;

namespace StockCrawler.Storage;

internal static class PatternScanPersistence
{
    private static string formatUtc(DateTime utc) {
        return utc.ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ");
    }

    public static long insertScanRun(
        LocalDatabase db,
        DateTime startedUtc,
        DateTime finishedUtc,
        IReadOnlyList<string> tickers)
    {
        var conn = db.getConnection();
        using var cmd = conn.CreateCommand();
        cmd.CommandText =
            """
            INSERT INTO scan_runs (started_utc, finished_utc, mode, tickers, report_path)
            VALUES (@s, @f, @m, @t, NULL)
            RETURNING id;
            """;
        cmd.Parameters.AddWithValue("@s", formatUtc(startedUtc));
        cmd.Parameters.AddWithValue("@f", formatUtc(finishedUtc));
        cmd.Parameters.AddWithValue("@m", "patterns");
        cmd.Parameters.AddWithValue("@t", string.Join(",", tickers));
        var rid = cmd.ExecuteScalar();
        return Convert.ToInt64(rid, System.Globalization.CultureInfo.InvariantCulture);
    }

    public static void insertSetupFromPattern(
        NpgsqlConnection conn,
        long runId,
        PatternTickerDto t,
        SetupClassificationResult c)
    {
        using var cmd = conn.CreateCommand();
        cmd.CommandText =
            """
            INSERT INTO setups (
                run_id, symbol, setup_type, direction, confluence, score,
                trigger_text, invalidation, t1, t2, rr, notes
            ) VALUES (
                @rid, @sym, @stype, @dir, @conf, @score,
                @trig, @inv, @t1, @t2, @rr, @notes
            );
            """;
        cmd.Parameters.AddWithValue("@rid", runId);
        cmd.Parameters.AddWithValue("@sym", t.Symbol.Trim().ToUpperInvariant());
        cmd.Parameters.AddWithValue("@stype", c.SetupType);
        cmd.Parameters.AddWithValue("@dir", (object?)c.Direction ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@conf", c.Confluence);
        cmd.Parameters.AddWithValue("@score", c.Score);
        cmd.Parameters.AddWithValue("@trig", (object?)c.TriggerText ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@inv", (object?)c.Invalidation ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@t1", (object?)c.T1 ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@t2", (object?)c.T2 ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@rr", (object?)c.Rr ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@notes", (object?)c.Notes ?? DBNull.Value);
        cmd.ExecuteNonQuery();
    }
}
