using Npgsql;
using StockCrawler.News;
using Alpaca.Markets;

namespace StockCrawler.Storage;

internal sealed class NewsWriter
{
    private static string formatUtc(DateTime utc) {
        return utc.ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ");
    }

    public void upsert(
        LocalDatabase db,
        IPage<INewsArticle>? page,
        IReadOnlyList<string> watchlist,
        DateTime fetchedUtc)
    {
        if (page == null || page.Items.Count == 0) {
            return;
        }
        var watch = new HashSet<string>(watchlist.Select(s => s.ToUpperInvariant()));
        var conn = db.getConnection();
        var fetchedStr = formatUtc(fetchedUtc);
        using var tx = conn.BeginTransaction();
        foreach (var a in page.Items) {
            var syms = (a.Symbols ?? Array.Empty<string>())
                .Select(s => s.ToUpperInvariant())
                .Where(watch.Contains)
                .Distinct()
                .ToList();
            if (syms.Count == 0) {
                continue;
            }
            upsertArticle(tx, a, fetchedStr);
            foreach (var s in syms) {
                linkSymbol(tx, a.Id, s);
            }
        }
        tx.Commit();
    }

    private static void upsertArticle(NpgsqlTransaction tx, INewsArticle a, string fetchedStr) {
        using var cmd = tx.Connection!.CreateCommand();
        cmd.Transaction = tx;
        cmd.CommandText =
            """
            INSERT INTO news_articles (
                id, created_at_utc, headline, summary, author, source, url, content, fetched_utc
            ) VALUES (
                @id, @c, @h, @sum, @auth, @src, @url, @body, @f
            )
            ON CONFLICT (id) DO UPDATE SET
                headline = EXCLUDED.headline,
                summary = COALESCE(EXCLUDED.summary, news_articles.summary),
                author = COALESCE(EXCLUDED.author, news_articles.author),
                source = COALESCE(EXCLUDED.source, news_articles.source),
                url = COALESCE(EXCLUDED.url, news_articles.url),
                content = CASE
                    WHEN EXCLUDED.content IS NOT NULL AND EXCLUDED.content != ''
                    THEN EXCLUDED.content
                    ELSE news_articles.content
                END,
                fetched_utc = EXCLUDED.fetched_utc;
            """;
        cmd.Parameters.AddWithValue("@id", a.Id);
        cmd.Parameters.AddWithValue("@c", formatUtc(a.CreatedAtUtc));
        cmd.Parameters.AddWithValue("@h", a.Headline ?? "");
        cmd.Parameters.AddWithValue("@sum", (object?)a.Summary ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@auth", (object?)a.Author ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@src", a.Source.ToString());
        var urlStr = a.ArticleUrl?.ToString();
        cmd.Parameters.AddWithValue("@url", string.IsNullOrEmpty(urlStr) ? DBNull.Value : urlStr);
        var plain = string.IsNullOrEmpty(a.Content) ? null : NewsText.stripHtml(a.Content);
        cmd.Parameters.AddWithValue("@body", string.IsNullOrEmpty(plain) ? DBNull.Value : plain);
        cmd.Parameters.AddWithValue("@f", fetchedStr);
        cmd.ExecuteNonQuery();
    }

    private static void linkSymbol(NpgsqlTransaction tx, long articleId, string symbol) {
        using var cmd = tx.Connection!.CreateCommand();
        cmd.Transaction = tx;
        cmd.CommandText =
            """
            INSERT INTO news_article_symbols (article_id, symbol) VALUES (@aid, @sym)
            ON CONFLICT (article_id, symbol) DO NOTHING;
            """;
        cmd.Parameters.AddWithValue("@aid", articleId);
        cmd.Parameters.AddWithValue("@sym", symbol);
        cmd.ExecuteNonQuery();
    }
}
