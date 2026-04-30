namespace StockCrawler.Patterns;

/// <summary>Ascending time series, derived from <see cref="Alpaca.Markets.IBar"/>.</summary>
internal readonly struct OhlcvBar
{
    public DateTime TimeUtc { get; init; }
    public double Open { get; init; }
    public double High { get; init; }
    public double Low { get; init; }
    public double Close { get; init; }
    public double Volume { get; init; }
}
