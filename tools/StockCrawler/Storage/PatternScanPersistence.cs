using Microsoft.Data.Sqlite;
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
            VALUES ($s, $f, $m, $t, NULL);
            """;
        cmd.Parameters.AddWithValue("$s", formatUtc(startedUtc));
        cmd.Parameters.AddWithValue("$f", formatUtc(finishedUtc));
        cmd.Parameters.AddWithValue("$m", "patterns");
        cmd.Parameters.AddWithValue("$t", string.Join(",", tickers));
        cmd.ExecuteNonQuery();
        using var idCmd = conn.CreateCommand();
        idCmd.CommandText = "SELECT last_insert_rowid();";
        var rid = idCmd.ExecuteScalar();
        return Convert.ToInt64(rid, System.Globalization.CultureInfo.InvariantCulture);
    }

    public static void insertSetupFromPattern(SqliteConnection conn, long runId, PatternTickerDto t) {
        var m = t.Timeframes?.Month1?.Trend ?? "range";
        var w = t.Timeframes?.Week1?.Trend ?? "range";
        var d = t.Timeframes?.Day1?.Trend ?? "range";
        var direction = d switch {
            "up" => "long",
            "down" => "short",
            _ => null
        };
        var confluence = $"M:{m} W:{w} D:{d}";
        var score = (m == w && w == d && d != "range") ? "high"
            : (d != "range" ? "medium" : "low");
        using var cmd = conn.CreateCommand();
        cmd.CommandText =
            """
            INSERT INTO setups (
                run_id, symbol, setup_type, direction, confluence, score,
                trigger_text, invalidation, t1, t2, rr, notes
            ) VALUES (
                $rid, $sym, $stype, $dir, $conf, $score,
                NULL, NULL, NULL, NULL, NULL, NULL
            );
            """;
        cmd.Parameters.AddWithValue("$rid", runId);
        cmd.Parameters.AddWithValue("$sym", t.Symbol.Trim().ToUpperInvariant());
        cmd.Parameters.AddWithValue("$stype", "pattern_scan");
        cmd.Parameters.AddWithValue("$dir", (object?)direction ?? DBNull.Value);
        cmd.Parameters.AddWithValue("$conf", confluence);
        cmd.Parameters.AddWithValue("$score", score);
        cmd.ExecuteNonQuery();
    }
}
