namespace StockCrawler;

/// <summary>US equity session windows (Eastern Time) for snapshot labeling.</summary>
internal static class UsMarketSession
{
    internal sealed record SessionInfo(string Id, string Label, string PriceBasis)
    {
        public bool IsExtended => string.Equals(PriceBasis, "extended", StringComparison.OrdinalIgnoreCase);
    }

    public static SessionInfo Classify(DateTime? atUtc = null)
    {
        var et = TimeZoneInfo.FindSystemTimeZoneById(
            OperatingSystem.IsWindows() ? "Eastern Standard Time" : "America/New_York");
        var at = atUtc.HasValue
            ? TimeZoneInfo.ConvertTimeFromUtc(DateTime.SpecifyKind(atUtc.Value, DateTimeKind.Utc), et)
            : TimeZoneInfo.ConvertTime(DateTime.UtcNow, TimeZoneInfo.Utc, et);

        var wd = at.DayOfWeek;
        var t = at.TimeOfDay;

        if (wd == DayOfWeek.Saturday) {
            return Closed();
        }
        if (wd == DayOfWeek.Sunday) {
            if (t < new TimeSpan(20, 0, 0)) {
                return Closed();
            }
            return Overnight();
        }
        if (wd == DayOfWeek.Friday && t >= new TimeSpan(20, 0, 0)) {
            return Closed();
        }

        if (t >= new TimeSpan(20, 0, 0) || t < new TimeSpan(4, 0, 0)) {
            return Overnight();
        }
        if (t < new TimeSpan(9, 30, 0)) {
            return Pre();
        }
        if (t < new TimeSpan(16, 0, 0)) {
            return Regular();
        }
        if (t < new TimeSpan(20, 0, 0)) {
            return Post();
        }
        return Overnight();
    }

    private static SessionInfo Pre() => new("pre", "Pre-market", "extended");
    private static SessionInfo Regular() => new("regular", "Regular", "regular");
    private static SessionInfo Post() => new("post", "After-hours", "extended");
    private static SessionInfo Overnight() => new("overnight", "Overnight", "extended");
    private static SessionInfo Closed() => new("closed", "Closed", "regular");
}
