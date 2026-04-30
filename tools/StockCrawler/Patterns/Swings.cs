namespace StockCrawler.Patterns;

internal static class Swings
{
    public static List<SwingPointJsonDto> swingHighs(IReadOnlyList<OhlcvBar> b) {
        var m = 2;
        var o = new List<SwingPointJsonDto>();
        if (b.Count < 2 * m + 1) {
            return o;
        }
        for (var i = m; i < b.Count - m; i++) {
            var ok = true;
            var h = b[i].High;
            for (var k = 1; k <= m; k++) {
                if (h <= b[i - k].High || h <= b[i + k].High) {
                    ok = false;
                    break;
                }
            }
            if (ok) {
                o.Add(new SwingPointJsonDto { TimeUtc = b[i].TimeUtc, Price = b[i].High });
            }
        }
        if (o.Count > 20) {
            o = o.Skip(o.Count - 20).ToList();
        }
        return o;
    }

    public static List<SwingPointJsonDto> swingLows(IReadOnlyList<OhlcvBar> b) {
        var m = 2;
        var o = new List<SwingPointJsonDto>();
        if (b.Count < 2 * m + 1) {
            return o;
        }
        for (var i = m; i < b.Count - m; i++) {
            var ok = true;
            var l = b[i].Low;
            for (var k = 1; k <= m; k++) {
                if (l >= b[i - k].Low || l >= b[i + k].Low) {
                    ok = false;
                    break;
                }
            }
            if (ok) {
                o.Add(new SwingPointJsonDto { TimeUtc = b[i].TimeUtc, Price = b[i].Low });
            }
        }
        if (o.Count > 20) {
            o = o.Skip(o.Count - 20).ToList();
        }
        return o;
    }

    public static List<LevelJsonDto> clusterLevels(
        IReadOnlyList<SwingPointJsonDto> highs,
        IReadOnlyList<SwingPointJsonDto> lows,
        double atr) {
        var points = new List<(double p, char k)>();
        foreach (var s in highs) {
            points.Add((s.Price, 'H'));
        }
        foreach (var s in lows) {
            points.Add((s.Price, 'L'));
        }
        if (points.Count == 0) {
            return new List<LevelJsonDto>();
        }
        var tol = Math.Max(1e-6, atr * 0.5);
        points.Sort((a, b) => a.p.CompareTo(b.p));
        var cl = new List<LevelJsonDto>();
        var accP = new List<double>();
        var hasH = false;
        var hasL = false;
        foreach (var t in points) {
            if (accP.Count == 0) {
                accP.Add(t.p);
                if (t.k == 'H') { hasH = true; } else { hasL = true; }
                continue;
            }
            var m = accP.Sum() / accP.Count;
            if (Math.Abs(t.p - m) <= tol) {
                accP.Add(t.p);
                if (t.k == 'H') { hasH = true; } else { hasL = true; }
            } else {
                cl.Add(flush(m, hasH, hasL, accP));
                accP = new List<double> { t.p };
                hasH = t.k == 'H';
                hasL = t.k == 'L';
            }
        }
        if (accP.Count > 0) {
            var m = accP.Sum() / accP.Count;
            cl.Add(flush(m, hasH, hasL, accP));
        }
        cl = cl
            .OrderByDescending(t => t.Touches)
            .ThenBy(t => t.Price)
            .Take(12)
            .ToList();
        return cl;
    }

    private static LevelJsonDto flush(double mean, bool h, bool l, IReadOnlyList<double> p) {
        return new LevelJsonDto {
            Price = mean,
            Touches = p.Count,
            Kinds = h && l ? "HL" : h ? "H" : "L"
        };
    }

    public static string trend(
        double lastClose,
        double? e20,
        double? e50,
        double? s200,
        double? adx,
        double? eSlope) {
        if (e20 is not { } a) {
            return "range";
        }
        if (e50 is not { } c) {
            return "range";
        }
        if (adx is not { } ad) {
            return "range";
        }
        if (ad < 20.0) {
            return "range";
        }
        var sUp = a > c && (s200 is { } s0b ? lastClose > s0b : true) && (eSlope ?? 0) > 0;
        var sDown = a < c && (s200 is { } s1b ? lastClose < s1b : true) && (eSlope ?? 0) < 0;
        if (sUp) {
            return "up";
        }
        if (sDown) {
            return "down";
        }
        return "range";
    }
}
