using Npgsql;

namespace StockCrawler.Storage;

internal sealed class LocalDatabase : IDisposable
{
    private readonly NpgsqlConnection connection;

    public LocalDatabase(string connectionString) {
        connection = new NpgsqlConnection(connectionString);
        connection.Open();
    }

    /// <summary>
    /// Builds the Npgsql connection string used when the caller does not pass an
    /// explicit one. Precedence: <c>CRAWLER_DATABASE_URL</c> (Npgsql keyword form
    /// or postgres:// URL) > individual <c>POSTGRES_*</c> / <c>CRAWLER_POSTGRES_DB</c>
    /// env vars > local-dev defaults matching docker-compose.yml.
    /// </summary>
    public static string getDefaultConnectionString() {
        var explicitConn = Environment.GetEnvironmentVariable("CRAWLER_DATABASE_URL");
        if (!string.IsNullOrWhiteSpace(explicitConn)) {
            return expandUrlStyle(explicitConn.Trim());
        }
        var host = firstNonEmpty(Environment.GetEnvironmentVariable("POSTGRES_HOST"), "127.0.0.1");
        var port = firstNonEmpty(Environment.GetEnvironmentVariable("POSTGRES_PORT"), "5432");
        var user = firstNonEmpty(Environment.GetEnvironmentVariable("POSTGRES_USER"), "trades");
        var pass = firstNonEmpty(Environment.GetEnvironmentVariable("POSTGRES_PASSWORD"), "trades");
        var db = firstNonEmpty(Environment.GetEnvironmentVariable("CRAWLER_POSTGRES_DB"), "crawler");
        var b = new NpgsqlConnectionStringBuilder {
            Host = host,
            Port = int.Parse(port),
            Username = user,
            Password = pass,
            Database = db,
            IncludeErrorDetail = true
        };
        return b.ToString();
    }

    private static string firstNonEmpty(string? value, string fallback) {
        return string.IsNullOrWhiteSpace(value) ? fallback : value!;
    }

    private static string expandUrlStyle(string raw) {
        // Npgsql natively accepts its keyword form. If the user supplied a
        // postgres:// URL, translate it via Uri -> ConnectionStringBuilder.
        if (raw.StartsWith("postgres://", StringComparison.OrdinalIgnoreCase)
            || raw.StartsWith("postgresql://", StringComparison.OrdinalIgnoreCase)) {
            var uri = new Uri(raw);
            var parts = uri.UserInfo.Split(':', 2);
            var b = new NpgsqlConnectionStringBuilder {
                Host = uri.Host,
                Port = uri.Port > 0 ? uri.Port : 5432,
                Username = parts.Length > 0 ? Uri.UnescapeDataString(parts[0]) : "",
                Password = parts.Length > 1 ? Uri.UnescapeDataString(parts[1]) : "",
                Database = uri.AbsolutePath.TrimStart('/'),
            };
            return b.ToString();
        }
        return raw;
    }

    public NpgsqlConnection getConnection() {
        return connection;
    }

    public void initialize() {
        using var tx = connection.BeginTransaction();
        execute(
            """
            CREATE TABLE IF NOT EXISTS bars (
                symbol     TEXT NOT NULL,
                timeframe  TEXT NOT NULL,
                time_utc   TEXT NOT NULL,
                open       DOUBLE PRECISION NOT NULL,
                high       DOUBLE PRECISION NOT NULL,
                low        DOUBLE PRECISION NOT NULL,
                close      DOUBLE PRECISION NOT NULL,
                volume     DOUBLE PRECISION NOT NULL,
                PRIMARY KEY (symbol, timeframe, time_utc)
            );
            """,
            tx);
        execute(
            """
            CREATE INDEX IF NOT EXISTS ix_bars_lookup
                ON bars (symbol, timeframe, time_utc DESC);
            """,
            tx);
        execute(
            """
            CREATE TABLE IF NOT EXISTS stocks (
                symbol         TEXT PRIMARY KEY,
                name           TEXT,
                exchange       TEXT,
                asset_class    TEXT,
                sector         TEXT,
                industry       TEXT,
                country        TEXT,
                is_active      INTEGER NOT NULL DEFAULT 1,
                first_seen_utc TEXT,
                last_seen_utc  TEXT
            );
            """,
            tx);
        execute(
            """
            CREATE TABLE IF NOT EXISTS earnings_quarterly (
                symbol            TEXT NOT NULL,
                fiscal_period     TEXT NOT NULL,
                fiscal_period_end TEXT NOT NULL,
                reported_date     TEXT,
                eps_actual        DOUBLE PRECISION,
                eps_estimate      DOUBLE PRECISION,
                eps_surprise_pct  DOUBLE PRECISION,
                revenue_actual    DOUBLE PRECISION,
                revenue_estimate  DOUBLE PRECISION,
                currency          TEXT,
                source            TEXT,
                fetched_utc       TEXT,
                PRIMARY KEY (symbol, fiscal_period)
            );
            """,
            tx);
        execute(
            """
            CREATE TABLE IF NOT EXISTS news_articles (
                id              BIGINT PRIMARY KEY,
                created_at_utc  TEXT NOT NULL,
                headline        TEXT NOT NULL,
                summary         TEXT,
                author          TEXT,
                source          TEXT,
                url             TEXT,
                content         TEXT,
                fetched_utc     TEXT NOT NULL
            );
            """,
            tx);
        execute(
            """
            CREATE TABLE IF NOT EXISTS news_article_symbols (
                article_id BIGINT NOT NULL,
                symbol     TEXT NOT NULL,
                PRIMARY KEY (article_id, symbol)
            );
            """,
            tx);
        execute(
            """
            CREATE TABLE IF NOT EXISTS snapshots (
                symbol         TEXT NOT NULL,
                captured_utc   TEXT NOT NULL,
                last_price     DOUBLE PRECISION,
                previous_close DOUBLE PRECISION,
                day_volume     DOUBLE PRECISION,
                percent_change DOUBLE PRECISION,
                PRIMARY KEY (symbol, captured_utc)
            );
            """,
            tx);
        execute(
            """
            CREATE TABLE IF NOT EXISTS corporate_actions (
                id            BIGSERIAL PRIMARY KEY,
                symbol        TEXT NOT NULL,
                action_type   TEXT NOT NULL,
                ex_date       TEXT,
                record_date   TEXT,
                payable_date  TEXT,
                cash_amount   DOUBLE PRECISION,
                split_ratio   TEXT,
                notes         TEXT
            );
            """,
            tx);
        execute(
            """
            CREATE TABLE IF NOT EXISTS analyst_actions (
                id            BIGSERIAL PRIMARY KEY,
                symbol        TEXT NOT NULL,
                action_date   TEXT NOT NULL,
                firm          TEXT,
                action        TEXT,
                prior_rating  TEXT,
                new_rating    TEXT,
                prior_target  DOUBLE PRECISION,
                new_target    DOUBLE PRECISION,
                notes         TEXT
            );
            """,
            tx);
        execute(
            """
            CREATE TABLE IF NOT EXISTS scan_runs (
                id           BIGSERIAL PRIMARY KEY,
                started_utc  TEXT NOT NULL,
                finished_utc TEXT,
                mode         TEXT NOT NULL,
                tickers      TEXT NOT NULL,
                report_path  TEXT
            );
            """,
            tx);
        execute(
            """
            CREATE TABLE IF NOT EXISTS setups (
                id           BIGSERIAL PRIMARY KEY,
                run_id       BIGINT NOT NULL,
                symbol       TEXT NOT NULL,
                setup_type   TEXT NOT NULL,
                direction    TEXT,
                confluence   TEXT,
                score        TEXT,
                trigger_text TEXT,
                invalidation TEXT,
                t1           DOUBLE PRECISION,
                t2           DOUBLE PRECISION,
                rr           DOUBLE PRECISION,
                notes        TEXT
            );
            """,
            tx);
        execute(
            """
            CREATE TABLE IF NOT EXISTS schema_meta (
                key   TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            """,
            tx);
        execute(
            """
            INSERT INTO schema_meta (key, value)
            VALUES ('schema_version', '1')
            ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
            """,
            tx);
        ensureNewsArticleContentColumn(tx);
        tx.Commit();
    }

    private void ensureNewsArticleContentColumn(NpgsqlTransaction tx) {
        if (columnExists(tx, "news_articles", "content")) {
            return;
        }
        execute("ALTER TABLE news_articles ADD COLUMN content TEXT;", tx);
    }

    private bool columnExists(NpgsqlTransaction tx, string table, string column) {
        using var cmd = connection.CreateCommand();
        cmd.Transaction = tx;
        cmd.CommandText =
            """
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = current_schema()
              AND table_name = @t
              AND column_name = @c
            LIMIT 1;
            """;
        cmd.Parameters.AddWithValue("@t", table);
        cmd.Parameters.AddWithValue("@c", column);
        var r = cmd.ExecuteScalar();
        return r != null && r != DBNull.Value;
    }

    private void execute(string sql, NpgsqlTransaction tx) {
        using var cmd = connection.CreateCommand();
        cmd.Transaction = tx;
        cmd.CommandText = sql;
        cmd.ExecuteNonQuery();
    }

    public void Dispose() {
        connection.Dispose();
    }
}
