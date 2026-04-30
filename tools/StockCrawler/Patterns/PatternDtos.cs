using System.Text.Json.Serialization;

namespace StockCrawler.Patterns;

internal sealed class PatternRootDto
{
    [JsonPropertyName("asOfUtc")]
    public DateTime AsOfUtc { get; set; }

    [JsonPropertyName("mode")]
    public string Mode { get; set; } = "patterns";

    [JsonPropertyName("withBarsDebug")]
    public bool WithBarsDebug { get; set; }

    [JsonPropertyName("tickers")]
    public List<PatternTickerDto> Tickers { get; set; } = new();
}

internal sealed class PatternTickerDto
{
    [JsonPropertyName("symbol")]
    public string Symbol { get; set; } = "";

    [JsonPropertyName("lastPrice")]
    public double? LastPrice { get; set; }

    [JsonPropertyName("timeframes")]
    public TimeframeBundleDto? Timeframes { get; set; }
}

internal sealed class TimeframeBundleDto
{
    [JsonPropertyName("1Month")]
    public TimeframeBlockDto? Month1 { get; set; }

    [JsonPropertyName("1Week")]
    public TimeframeBlockDto? Week1 { get; set; }

    [JsonPropertyName("1Day")]
    public TimeframeBlockDto? Day1 { get; set; }
}

internal sealed class TimeframeBlockDto
{
    [JsonPropertyName("trend")]
    public string Trend { get; set; } = "range";

    [JsonPropertyName("indicators")]
    public IndicatorsJsonDto? Indicators { get; set; }

    [JsonPropertyName("swingHighs")]
    public List<SwingPointJsonDto> SwingHighs { get; set; } = new();

    [JsonPropertyName("swingLows")]
    public List<SwingPointJsonDto> SwingLows { get; set; } = new();

    [JsonPropertyName("levels")]
    public List<LevelJsonDto> Levels { get; set; } = new();

    [JsonPropertyName("range20")]
    public RangeJsonDto? Range20 { get; set; }

    [JsonPropertyName("lastCandle")]
    public LastCandleJsonDto? LastCandle { get; set; }

    [JsonPropertyName("bars")]
    public List<BarSlimJsonDto>? Bars { get; set; }
}

internal sealed class IndicatorsJsonDto
{
    [JsonPropertyName("ema20")]
    public double? Ema20 { get; set; }

    [JsonPropertyName("ema50")]
    public double? Ema50 { get; set; }

    [JsonPropertyName("sma200")]
    public double? Sma200 { get; set; }

    [JsonPropertyName("ema20Slope10")]
    public double? Ema20Slope10 { get; set; }

    [JsonPropertyName("atr14")]
    public double? Atr14 { get; set; }

    [JsonPropertyName("rsi14")]
    public double? Rsi14 { get; set; }

    [JsonPropertyName("adx14")]
    public double? Adx14 { get; set; }

    [JsonPropertyName("diPlus14")]
    public double? DiPlus14 { get; set; }

    [JsonPropertyName("diMinus14")]
    public double? DiMinus14 { get; set; }

    [JsonPropertyName("vwapLastSession")]
    public double? VwapLastSession { get; set; }

    [JsonPropertyName("vwapIsoWeek")]
    public double? VwapIsoWeek { get; set; }

    [JsonPropertyName("lastVolZ20")]
    public double? LastVolZ20 { get; set; }
}

internal sealed class SwingPointJsonDto
{
    [JsonPropertyName("timeUtc")]
    public DateTime TimeUtc { get; set; }

    [JsonPropertyName("price")]
    public double Price { get; set; }
}

internal sealed class LevelJsonDto
{
    [JsonPropertyName("price")]
    public double Price { get; set; }

    [JsonPropertyName("touches")]
    public int Touches { get; set; }

    [JsonPropertyName("kinds")]
    public string? Kinds { get; set; }
}

internal sealed class RangeJsonDto
{
    [JsonPropertyName("lookback")]
    public int Lookback { get; set; }

    [JsonPropertyName("high")]
    public double High { get; set; }

    [JsonPropertyName("low")]
    public double Low { get; set; }

    [JsonPropertyName("distCloseToHighPct")]
    public double? DistCloseToHighPct { get; set; }

    [JsonPropertyName("distCloseToLowPct")]
    public double? DistCloseToLowPct { get; set; }

    [JsonPropertyName("distToHighAtr14")]
    public double? DistToHighAtr14 { get; set; }

    [JsonPropertyName("distToLowAtr14")]
    public double? DistToLowAtr14 { get; set; }
}

internal sealed class LastCandleJsonDto
{
    [JsonPropertyName("timeUtc")]
    public DateTime TimeUtc { get; set; }

    [JsonPropertyName("open")]
    public double Open { get; set; }

    [JsonPropertyName("high")]
    public double High { get; set; }

    [JsonPropertyName("low")]
    public double Low { get; set; }

    [JsonPropertyName("close")]
    public double Close { get; set; }

    [JsonPropertyName("bodyPctOfRange")]
    public double? BodyPctOfRange { get; set; }

    [JsonPropertyName("upperWickPctOfRange")]
    public double? UpperWickPctOfRange { get; set; }

    [JsonPropertyName("lowerWickPctOfRange")]
    public double? LowerWickPctOfRange { get; set; }
}

/// <summary>Included only when <c>--with-bars</c> (debug); compact OHLCV for inspection.</summary>
internal sealed class BarSlimJsonDto
{
    [JsonPropertyName("t")]
    public DateTime TimeUtc { get; set; }

    [JsonPropertyName("o")]
    public double O { get; set; }

    [JsonPropertyName("h")]
    public double H { get; set; }

    [JsonPropertyName("l")]
    public double L { get; set; }

    [JsonPropertyName("c")]
    public double C { get; set; }

    [JsonPropertyName("v")]
    public double V { get; set; }
}
