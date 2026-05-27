using Alpaca.Markets;

namespace StockCrawler.News;

internal sealed record SnapshotQuote(
    decimal? LastPrice,
    decimal? PreviousClose,
    decimal? PercentChange,
    decimal? DayVolume);

internal static class SnapshotMetrics
{
    internal static SnapshotQuote FromSnapshot(ISnapshot? snap, bool preferExtendedPrints)
    {
        if (snap == null) {
            return new SnapshotQuote(null, null, null, null);
        }

        decimal? last = null;
        decimal? vol = null;

        if (preferExtendedPrints) {
            if (snap.Trade is { } tr) {
                last = tr.Price;
            }
            if (snap.MinuteBar is { } mb) {
                last ??= mb.Close;
            }
            if (snap.CurrentDailyBar is { } cdbExt) {
                last ??= cdbExt.Close;
                vol = cdbExt.Volume;
            }
        } else {
            if (snap.CurrentDailyBar is { } cdb) {
                last = cdb.Close;
                vol = cdb.Volume;
            }
            if (snap.Trade is { } trReg) {
                last ??= trReg.Price;
            }
        }

        if (vol == null && snap.CurrentDailyBar is { } cdbVol) {
            vol = cdbVol.Volume;
        }

        decimal? prevClose = snap.PreviousDailyBar?.Close;
        decimal? pct = null;
        if (last is { } lp && prevClose is { } pc && pc != 0) {
            pct = 100m * (lp - pc) / pc;
        }

        return new SnapshotQuote(last, prevClose, pct, vol);
    }
}
