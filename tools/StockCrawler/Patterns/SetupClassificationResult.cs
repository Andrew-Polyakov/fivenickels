namespace StockCrawler.Patterns;

internal sealed class SetupClassificationResult
{
    public string SetupType { get; set; } = "watch";
    public string? Direction { get; set; }
    public string Confluence { get; set; } = "";
    public string Score { get; set; } = "low";
    public string? TriggerText { get; set; }
    public string? Invalidation { get; set; }
    public double? T1 { get; set; }
    public double? T2 { get; set; }
    public double? Rr { get; set; }
    public string? Notes { get; set; }
}
