using System.Text.Json.Serialization;

namespace StockCrawler.News;

internal sealed class RootDto
{
    [JsonPropertyName("asOfUtc")]
    public DateTime AsOfUtc { get; set; }

    [JsonPropertyName("mode")]
    public string? Mode { get; set; } = "news";

    [JsonPropertyName("marketSession")]
    public string? MarketSession { get; set; }

    [JsonPropertyName("marketSessionLabel")]
    public string? MarketSessionLabel { get; set; }

    [JsonPropertyName("priceBasis")]
    public string? PriceBasis { get; set; }

    [JsonPropertyName("dataFeed")]
    public string? DataFeed { get; set; }

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

    [JsonPropertyName("priceBasis")]
    public string? PriceBasis { get; set; }

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

    /// <summary>Alpaca summary (may mirror first sentence of content).</summary>
    [JsonPropertyName("summary")]
    public string? Summary { get; set; }

    /// <summary>Plain text body, HTML stripped; truncated for stdout JSON.</summary>
    [JsonPropertyName("content")]
    public string? Content { get; set; }

    [JsonPropertyName("source")]
    public string? Source { get; set; }

    [JsonPropertyName("url")]
    public string? Url { get; set; }

    /// <summary>Related symbols from Alpaca (reuse as tag-like metadata).</summary>
    [JsonPropertyName("symbols")]
    public List<string> Symbols { get; set; } = new();

    /// <summary>semiconductor (when symbol in semi set) + Alpaca symbols + source slug, deduped.</summary>
    [JsonPropertyName("tags")]
    public List<string> Tags { get; set; } = new();
}

internal sealed class WebHintDto
{
    [JsonPropertyName("titleOrSnippet")]
    public string? TitleOrSnippet { get; set; }

    [JsonPropertyName("source")]
    public string? Source { get; set; }
}
