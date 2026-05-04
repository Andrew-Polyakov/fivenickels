using System.Text.RegularExpressions;

namespace StockCrawler.News;

/// <summary>Strip HTML and collapse whitespace for JSON-sized news text.</summary>
internal static class NewsText
{
    private static readonly Regex s_tag = new("<[^>]+>", RegexOptions.Compiled | RegexOptions.CultureInvariant);
    private static readonly Regex s_ws = new(@"\s+", RegexOptions.Compiled | RegexOptions.CultureInvariant);

    public static string stripHtml(string? html) {
        if (string.IsNullOrEmpty(html)) {
            return "";
        }
        var t = s_tag.Replace(html, " ");
        t = System.Net.WebUtility.HtmlDecode(t);
        t = s_ws.Replace(t, " ").Trim();
        return t;
    }

    /// <summary>Plain text for JSON: stripped and truncated with ellipsis.</summary>
    public static string stripHtmlTruncate(string? html, int maxChars) {
        if (string.IsNullOrEmpty(html) || maxChars <= 0) {
            return "";
        }
        var t = stripHtml(html);
        if (t.Length <= maxChars) {
            return t;
        }
        return t[..(maxChars - 1)] + "…";
    }
}
