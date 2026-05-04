using Microsoft.Data.Sqlite;

namespace StockCrawler.Storage;

internal sealed class LocalDatabase : IDisposable
{
    private readonly SqliteConnection connection;

    public LocalDatabase(string dbPath) {
        connection = new SqliteConnection($"Data Source={dbPath}");
        connection.Open();
    }

    public static string getDefaultDbPath() {
        var root = findRepoRoot();
        var cacheDir = Path.Combine(root, ".cache");
        Directory.CreateDirectory(cacheDir);
        return Path.Combine(cacheDir, "trades.sqlite");
    }

    public SqliteConnection getConnection() {
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
                open       REAL NOT NULL,
                high       REAL NOT NULL,
                low        REAL NOT NULL,
                close      REAL NOT NULL,
                volume     REAL NOT NULL,
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
                eps_actual        REAL,
                eps_estimate      REAL,
                eps_surprise_pct  REAL,
                revenue_actual    REAL,
                revenue_estimate  REAL,
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
                id              INTEGER PRIMARY KEY,
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
                article_id INTEGER NOT NULL,
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
                last_price     REAL,
                previous_close REAL,
                day_volume     REAL,
                percent_change REAL,
                PRIMARY KEY (symbol, captured_utc)
            );
            """,
            tx);
        execute(
            """
            CREATE TABLE IF NOT EXISTS corporate_actions (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                symbol        TEXT NOT NULL,
                action_type   TEXT NOT NULL,
                ex_date       TEXT,
                record_date   TEXT,
                payable_date  TEXT,
                cash_amount   REAL,
                split_ratio   TEXT,
                notes         TEXT
            );
            """,
            tx);
        execute(
            """
            CREATE TABLE IF NOT EXISTS analyst_actions (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                symbol        TEXT NOT NULL,
                action_date   TEXT NOT NULL,
                firm          TEXT,
                action        TEXT,
                prior_rating  TEXT,
                new_rating    TEXT,
                prior_target  REAL,
                new_target    REAL,
                notes         TEXT
            );
            """,
            tx);
        execute(
            """
            CREATE TABLE IF NOT EXISTS scan_runs (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
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
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                run_id       INTEGER NOT NULL,
                symbol       TEXT NOT NULL,
                setup_type   TEXT NOT NULL,
                direction    TEXT,
                confluence   TEXT,
                score        TEXT,
                trigger_text TEXT,
                invalidation TEXT,
                t1           REAL,
                t2           REAL,
                rr           REAL,
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
            INSERT OR REPLACE INTO schema_meta (key, value)
            VALUES ('schema_version', '1');
            """,
            tx);
        ensureNewsArticleContentColumn(tx);
        tx.Commit();
    }

    private void ensureNewsArticleContentColumn(SqliteTransaction tx) {
        if (columnExists(tx, "news_articles", "content")) {
            return;
        }
        execute("ALTER TABLE news_articles ADD COLUMN content TEXT;", tx);
    }

    private bool columnExists(SqliteTransaction tx, string table, string column) {
        using var cmd = connection.CreateCommand();
        cmd.Transaction = tx;
        cmd.CommandText = $"PRAGMA table_info({table});";
        using var r = cmd.ExecuteReader();
        while (r.Read()) {
            var name = r.GetString(1);
            if (string.Equals(name, column, StringComparison.OrdinalIgnoreCase)) {
                return true;
            }
        }
        return false;
    }

    private static string findRepoRoot() {
        for (var d = new DirectoryInfo(Path.GetFullPath(Directory.GetCurrentDirectory()));
             d != null;
             d = d.Parent) {
            if (Directory.Exists(Path.Combine(d.FullName, "tools"))) {
                return d.FullName;
            }
        }
        return Directory.GetCurrentDirectory();
    }

    private void execute(string sql, SqliteTransaction tx) {
        using var cmd = connection.CreateCommand();
        cmd.Transaction = tx;
        cmd.CommandText = sql;
        cmd.ExecuteNonQuery();
    }

    public void Dispose() {
        connection.Dispose();
    }
}
