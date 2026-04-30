using System.Globalization;

namespace StockCrawler.Patterns;

/// <summary>All series use ascending time order, close[] aligned with the same bars.</summary>
internal static class IndicatorMath
{
    public static double?[] ema(IReadOnlyList<double> close, int period) {
        var n = close.Count;
        if (n == 0 || period <= 0) {
            return Array.Empty<double?>();
        }
        var a = 2.0 / (period + 1.0);
        var outA = new double?[n];
        if (n < 1) {
            return outA;
        }
        outA[0] = close[0];
        for (var i = 1; i < n; i++) {
            var prev = outA[i - 1] ?? close[i];
            outA[i] = a * close[i] + (1.0 - a) * prev;
        }
        return outA;
    }

    public static double? lastNonNull(IReadOnlyList<double?>? series) {
        if (series == null) {
            return null;
        }
        for (var i = series.Count - 1; i >= 0; i--) {
            if (series[i] is { } v) {
                return v;
            }
        }
        return null;
    }

    public static double? smaAt(IReadOnlyList<double> values, int period) {
        if (values.Count < period || period <= 0) {
            return null;
        }
        var sum = 0.0;
        for (var i = values.Count - period; i < values.Count; i++) {
            sum += values[i];
        }
        return sum / period;
    }

    public static double? atr14(IReadOnlyList<OhlcvBar> b) {
        if (b.Count < 2) {
            return null;
        }
        const int p = 14;
        if (b.Count < p) {
            return null;
        }
        var tr = new double[b.Count];
        for (var i = 0; i < b.Count; i++) {
            if (i == 0) {
                tr[i] = b[i].High - b[i].Low;
            } else {
                var h = b[i].High;
                var lo = b[i].Low;
                var pc = b[i - 1].Close;
                tr[i] = Math.Max(h - lo, Math.Max(Math.Abs(h - pc), Math.Abs(lo - pc)));
            }
        }
        var s = 0.0;
        for (var i = 0; i < p; i++) {
            s += tr[i];
        }
        var aTr = s / p;
        for (var i = p; i < b.Count; i++) {
            aTr = (aTr * 13.0 + tr[i]) / 14.0;
        }
        return aTr;
    }

    public static double? rsi14(IReadOnlyList<double> close) {
        if (close.Count < 16) {
            return null;
        }
        const int p = 14;
        var gains = new double[close.Count];
        var losses = new double[close.Count];
        for (var i = 1; i < close.Count; i++) {
            var d = close[i] - close[i - 1];
            gains[i] = d > 0 ? d : 0.0;
            losses[i] = d < 0 ? -d : 0.0;
        }
        var g = 0.0;
        var l = 0.0;
        for (var i = 1; i <= p; i++) {
            g += gains[i];
            l += losses[i];
        }
        var avgG = g / p;
        var avgL = l / p;
        for (var i = p + 1; i < close.Count; i++) {
            avgG = (avgG * (p - 1) + gains[i]) / p;
            avgL = (avgL * (p - 1) + losses[i]) / p;
        }
        if (avgG + avgL < 1e-12) {
            return 50.0;
        }
        return 100.0 - 100.0 / (1.0 + avgG / (avgL + 1e-12));
    }

    /// <summary>
    ///   Wilder ADX(14) with +DI / -DI at the last bar. First TR slice uses bars <c>0..13</c>,
    ///   first Wilder update at bar 14, matching a common 14+14+ warm-up.
    /// </summary>
    public static (double? adx, double? dPlus, double? dMinus) adx14(IReadOnlyList<OhlcvBar> b) {
        const int p = 14;
        if (b.Count < 2 * p) {
            return (null, null, null);
        }
        var n = b.Count;
        var tr = new double[n];
        var pDm = new double[n];
        var mDm = new double[n];
        for (var i = 0; i < n; i++) {
            if (i == 0) {
                tr[i] = b[i].High - b[i].Low;
            } else {
                var h = b[i].High;
                var lo = b[i].Low;
                var ph = b[i - 1].High;
                var pl = b[i - 1].Low;
                tr[i] = Math.Max(h - lo, Math.Max(Math.Abs(h - b[i - 1].Close), Math.Abs(lo - b[i - 1].Close)));
                var u = h - ph;
                var d0 = pl - lo;
                pDm[i] = (u > d0 && u > 0) ? u : 0;
                mDm[i] = (d0 > u && d0 > 0) ? d0 : 0;
            }
        }
        var sTr = 0.0;
        var sP = 0.0;
        var sM = 0.0;
        for (var j = 0; j < p; j++) {
            sTr += tr[j];
            sP += pDm[j];
            sM += mDm[j];
        }
        var aTr = sTr / p;
        var aP = sP / p;
        var aM = sM / p;
        var dxx = new double[n - p];
        var dxi = 0;
        for (var i = p; i < n; i++) {
            aTr = (aTr * 13.0 + tr[i]) / 14.0;
            aP = (aP * 13.0 + pDm[i]) / 14.0;
            aM = (aM * 13.0 + mDm[i]) / 14.0;
            var dIp = 100.0 * aP / (aTr + 1e-12);
            var dIm = 100.0 * aM / (aTr + 1e-12);
            var sm = dIp + dIm;
            var dxx0 = sm < 1e-12 ? 0.0 : 100.0 * Math.Abs(dIp - dIm) / sm;
            dxx[dxi++] = dxx0;
        }
        var m = dxx.Length;
        if (m < p) {
            return (null, null, null);
        }
        // First ADX = mean of first p DX; then Wilder
        var aDx = 0.0;
        for (var j = 0; j < p; j++) {
            aDx += dxx[j];
        }
        aDx /= p;
        for (var j = p; j < m; j++) {
            aDx = (aDx * 13.0 + dxx[j]) / 14.0;
        }
        aTr = 0.0; aP = 0.0; aM = 0.0;
        for (var j = 0; j < p; j++) {
            aTr += tr[j];
            aP += pDm[j];
            aM += mDm[j];
        }
        aTr /= p;
        aP /= p;
        aM /= p;
        for (var i = p; i < n; i++) {
            aTr = (aTr * 13.0 + tr[i]) / 14.0;
            aP = (aP * 13.0 + pDm[i]) / 14.0;
            aM = (aM * 13.0 + mDm[i]) / 14.0;
        }
        var lDp = 100.0 * aP / (aTr + 1e-12);
        var lDm = 100.0 * aM / (aTr + 1e-12);
        return (aDx, lDp, lDm);
    }

    public static double? ema20Slope10(IReadOnlyList<double> close) {
        var e = ema(close, 20);
        if (e.Length < 11) {
            return null;
        }
        if (e[^1] is not { } la || e[^11] is not { } lb) {
            return null;
        }
        return (la - lb) / 10.0;
    }

    public static double? lastVolZ(IReadOnlyList<OhlcvBar> b, int w) {
        if (b.Count < w + 1) {
            return null;
        }
        var v = b[^1].Volume;
        var sum = 0.0;
        var sumSq = 0.0;
        for (var i = b.Count - 1 - w; i < b.Count - 1; i++) {
            sum += b[i].Volume;
            sumSq += b[i].Volume * b[i].Volume;
        }
        var m0 = sum / w;
        var v0 = (sumSq / w) - m0 * m0;
        if (v0 < 1e-12) {
            return 0.0;
        }
        return (v - m0) / Math.Sqrt(v0);
    }

    public static double? vwapSession(IReadOnlyList<OhlcvBar> b) {
        if (b.Count == 0) {
            return null;
        }
        var d0 = b[^1].TimeUtc.Date;
        double pV = 0, v = 0;
        for (var i = 0; i < b.Count; i++) {
            if (b[i].TimeUtc.Date != d0) {
                continue;
            }
            var tp = (b[i].High + b[i].Low + b[i].Close) / 3.0;
            var vol = b[i].Volume < 0 ? 0 : b[i].Volume;
            pV += tp * vol;
            v += vol;
        }
        if (v < 1e-9) {
            return b[^1].Close;
        }
        return pV / v;
    }

    public static double? vwapIsoWeek(IReadOnlyList<OhlcvBar> b) {
        if (b.Count == 0) {
            return null;
        }
        var t = b[^1].TimeUtc;
        var (y, w) = (ISOWeek.GetYear(t), ISOWeek.GetWeekOfYear(t));
        double pV = 0, v = 0;
        for (var i = 0; i < b.Count; i++) {
            var t0 = b[i].TimeUtc;
            if (ISOWeek.GetYear(t0) == y && ISOWeek.GetWeekOfYear(t0) == w) {
                var tp = (b[i].High + b[i].Low + b[i].Close) / 3.0;
                var vol = b[i].Volume < 0 ? 0 : b[i].Volume;
                pV += tp * vol;
                v += vol;
            }
        }
        if (v < 1e-9) {
            return b[^1].Close;
        }
        return pV / v;
    }
}
