using System.Text.Json.Serialization;

namespace StockCrawler.News;

internal sealed class RootDto
{
    [JsonPropertyName("asOfUtc")]
    public DateTime AsOfUtc { get; set; }

    [JsonPropertyName("mode")]
    public string? Mode { get; set; } = "news";

    [JsonPropertyName("tickers")]
    public List<TickerBlockDto> Tickers { get; set; } = new();
}

internal sealed class TickerBlockDto
{
    [JsonPropertyName("symbol")]
    public string Symbol { get; set; } = "";

    [JsonPropertyName("lastPrice")]
    public decimal? LastPrice { get; set; }

    [JsonPropertyName("previousClose")]
    public decimal? PreviousClose { get; set; }

    [JsonPropertyName("dayVolume")]
    public decimal? DayVolume { get; set; }

    [JsonPropertyName("percentChange")]
    public decimal? PercentChange { get; set; }

    [JsonPropertyName("alpacNews")]
    public List<NewsLineDto> AlpacNews { get; set; } = new();

    [JsonPropertyName("webHints")]
    public List<WebHintDto> WebHints { get; set; } = new();

    [JsonPropertyName("note")]
    public string? Note { get; set; } = "Add web search lines in webHints; aggregate catalyst in the .md report.";
}

internal sealed class NewsLineDto
{
    [JsonPropertyName("headline")]
    public string? Headline { get; set; }

    [JsonPropertyName("createdAtUtc")]
    public DateTime? CreatedAtUtc { get; set; }
}

internal sealed class WebHintDto
{
    [JsonPropertyName("titleOrSnippet")]
    public string? TitleOrSnippet { get; set; }

    [JsonPropertyName("source")]
    public string? Source { get; set; }
}
