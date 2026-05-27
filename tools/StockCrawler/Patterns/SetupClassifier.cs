namespace StockCrawler.Patterns;

/// <summary>
/// Classifies swing setups from multi-timeframe pattern JSON (pattern-recognition rubric).
/// </summary>
internal static class SetupClassifier
{
  private const double BreakoutAtrFrac = 0.25;
  private const double VolZBreakoutMin = 1.5;
  private const double PullbackAtrMax = 0.5;
  private const double ReversalRsiLongMax = 35.0;
  private const double ReversalRsiShortMin = 65.0;
  private const double LevelAtrTol = 0.5;
  private const double WickReversalMin = 0.55;

  public static SetupClassificationResult classify(PatternTickerDto ticker) {
    var m = ticker.Timeframes?.Month1;
    var w = ticker.Timeframes?.Week1;
    var d = ticker.Timeframes?.Day1;
    var mTrend = m?.Trend ?? "range";
    var wTrend = w?.Trend ?? "range";
    var dTrend = d?.Trend ?? "range";
    var lastPrice = ticker.LastPrice;
    var confluence = $"M:{mTrend} W:{wTrend} D:{dTrend}";

    if (d == null || lastPrice is not { } px) {
      return watchResult(confluence, mTrend, wTrend, dTrend, "Insufficient daily bar data.");
    }

    var ind = d.Indicators;
    var atr = ind?.Atr14;
    var ema20 = ind?.Ema20;
    var ema50 = ind?.Ema50;
    var adx = ind?.Adx14;
    var rsi = ind?.Rsi14;
    var volZ = ind?.LastVolZ20;
    var r20 = d.Range20;
    var last = d.LastCandle;

    string? activeDir = null;
    string setupType = "watch";
    string? trigger = null;
    string? invalidation = null;
    double? t1 = null;
    double? t2 = null;
    double? rr = null;
    var noteParts = new List<string> {
      fmtPrice(px),
      $"M/W/D {trendGlyph(mTrend)}/{trendGlyph(wTrend)}/{trendGlyph(dTrend)}",
    };
    if (adx is { } adxV) {
      noteParts.Add($"ADX {adxV:F1}");
    }
    if (rsi is { } rsiV) {
      noteParts.Add($"RSI {rsiV:F0}");
    }
    if (atr is { } atrV && r20 != null) {
      var distHigh = r20.DistToHighAtr14;
      if (distHigh is { } dh) {
        noteParts.Add($"dist20H {dh:F2}×ATR");
      }
    }
    if (volZ is { } vz) {
      noteParts.Add($"volZ {vz:F2}");
    }

    if (tryContinuationLong(mTrend, wTrend, dTrend, px, atr, ema20, ema50, adx, d, out var contLong)) {
      activeDir = "long";
      setupType = "continuation";
      trigger = contLong.trigger;
      invalidation = contLong.invalidation;
      t1 = contLong.t1;
      t2 = contLong.t2;
      rr = contLong.rr;
      noteParts.Add(contLong.note);
    } else if (tryContinuationShort(mTrend, wTrend, dTrend, px, atr, ema20, ema50, adx, d, out var contShort)) {
      activeDir = "short";
      setupType = "continuation";
      trigger = contShort.trigger;
      invalidation = contShort.invalidation;
      t1 = contShort.t1;
      t2 = contShort.t2;
      rr = contShort.rr;
      noteParts.Add(contShort.note);
    } else if (tryBreakoutLong(px, atr, volZ, r20, d, out var boLong)) {
      activeDir = "long";
      setupType = "breakout";
      trigger = boLong.trigger;
      invalidation = boLong.invalidation;
      t1 = boLong.t1;
      t2 = boLong.t2;
      rr = boLong.rr;
      noteParts.Add(boLong.note);
    } else if (tryBreakoutShort(px, atr, volZ, r20, d, out var boShort)) {
      activeDir = "short";
      setupType = "breakout";
      trigger = boShort.trigger;
      invalidation = boShort.invalidation;
      t1 = boShort.t1;
      t2 = boShort.t2;
      rr = boShort.rr;
      noteParts.Add(boShort.note);
    } else if (tryReversalLong(dTrend, rsi, atr, ema20, last, d, px, out var revLong)) {
      activeDir = "long";
      setupType = "reversal";
      trigger = revLong.trigger;
      invalidation = revLong.invalidation;
      t1 = revLong.t1;
      t2 = revLong.t2;
      rr = revLong.rr;
      noteParts.Add(revLong.note);
    } else if (tryReversalShort(dTrend, rsi, atr, ema20, last, d, px, out var revShort)) {
      activeDir = "short";
      setupType = "reversal";
      trigger = revShort.trigger;
      invalidation = revShort.invalidation;
      t1 = revShort.t1;
      t2 = revShort.t2;
      rr = revShort.rr;
      noteParts.Add(revShort.note);
    } else {
      noteParts.Add(watchReason(mTrend, wTrend, dTrend, px, atr, ema20, ema50, adx, volZ, r20, d));
    }

    var agree = countAlignedTimeframes(mTrend, wTrend, dTrend, activeDir);
    var score = agree switch {
      >= 3 => "high",
      2 => "medium",
      _ => "low",
    };

    return new SetupClassificationResult {
      SetupType = setupType,
      Direction = activeDir,
      Confluence = confluence,
      Score = score,
      TriggerText = trigger,
      Invalidation = invalidation,
      T1 = t1,
      T2 = t2,
      Rr = rr,
      Notes = string.Join("; ", noteParts),
    };
  }

  private static SetupClassificationResult watchResult(
    string confluence,
    string m,
    string w,
    string d,
    string reason) {
    return new SetupClassificationResult {
      SetupType = "watch",
      Direction = null,
      Confluence = confluence,
      Score = scoreFromTrends(m, w, d, null),
      Notes = reason,
    };
  }

  private static string scoreFromTrends(string m, string w, string d, string? dir) {
    var n = countAlignedTimeframes(m, w, d, dir);
    return n switch {
      >= 3 => "high",
      2 => "medium",
      _ => "low",
    };
  }

  private static int countAlignedTimeframes(string m, string w, string d, string? dir) {
    if (dir == "long") {
      return new[] { m, w, d }.Count(t => t == "up");
    }
    if (dir == "short") {
      return new[] { m, w, d }.Count(t => t == "down");
    }
    var up = new[] { m, w, d }.Count(t => t == "up");
    var down = new[] { m, w, d }.Count(t => t == "down");
    return Math.Max(up, down);
  }

  private sealed class RuleOutcome
  {
    public string trigger = "";
    public string invalidation = "";
    public double? t1;
    public double? t2;
    public double? rr;
    public string note = "";
  }

  private static bool tryContinuationLong(
    string mTrend,
    string wTrend,
    string dTrend,
    double px,
    double? atr,
    double? ema20,
    double? ema50,
    double? adx,
    TimeframeBlockDto d,
    out RuleOutcome o) {
    o = new RuleOutcome();
    if (mTrend != "up" || wTrend != "up" || dTrend != "up") {
      return false;
    }
    if (adx is not { } adxV || adxV < 20) {
      return false;
    }
    if (atr is not { } atrV || atrV < 1e-9) {
      return false;
    }
    var nearEma = false;
    if (ema20 is { } e20) {
      nearEma = Math.Abs(px - e20) <= PullbackAtrMax * atrV;
    }
    if (!nearEma && ema50 is { } e50) {
      nearEma = Math.Abs(px - e50) <= PullbackAtrMax * atrV;
    }
    if (!nearEma) {
      return false;
    }
    if (!higherLowOnDay(d)) {
      o.note = "HL swings unclear (<2 lows)";
      return false;
    }
    var entry = px;
    var stop = nearestSupport(d, px, atrV);
    var targets = targetsLong(d, px, atrV, entry);
    o.trigger = ema20 is { } e
      ? $"Pullback hold near EMA20 (~{e:F2}) or EMA50 stack"
      : "Pullback to EMA stack on 1D";
    o.invalidation = stop is { } s
      ? $"Below 1D support / swing low ~{s:F2}"
      : "Below nearest 1D swing low";
    o.t1 = targets.t1;
    o.t2 = targets.t2;
    o.rr = riskReward(entry, stop, targets.t1);
    o.note = "Continuation long: M/W/D up, pullback to EMA";
    return true;
  }

  private static bool tryContinuationShort(
    string mTrend,
    string wTrend,
    string dTrend,
    double px,
    double? atr,
    double? ema20,
    double? ema50,
    double? adx,
    TimeframeBlockDto d,
    out RuleOutcome o) {
    o = new RuleOutcome();
    if (mTrend != "down" || wTrend != "down" || dTrend != "down") {
      return false;
    }
    if (adx is not { } adxV || adxV < 20) {
      return false;
    }
    if (atr is not { } atrV || atrV < 1e-9) {
      return false;
    }
    var nearEma = false;
    if (ema20 is { } e20) {
      nearEma = Math.Abs(px - e20) <= PullbackAtrMax * atrV;
    }
    if (!nearEma && ema50 is { } e50) {
      nearEma = Math.Abs(px - e50) <= PullbackAtrMax * atrV;
    }
    if (!nearEma) {
      return false;
    }
    if (!lowerHighOnDay(d)) {
      o.note = "LH swings unclear (<2 highs)";
      return false;
    }
    var entry = px;
    var stop = nearestResistance(d, px, atrV);
    var targets = targetsShort(d, px, atrV, entry);
    o.trigger = ema20 is { } e
      ? $"Pullback hold near EMA20 (~{e:F2}) or EMA50 stack"
      : "Pullback to EMA stack on 1D";
    o.invalidation = stop is { } s
      ? $"Above 1D resistance / swing high ~{s:F2}"
      : "Above nearest 1D swing high";
    o.t1 = targets.t1;
    o.t2 = targets.t2;
    o.rr = riskReward(entry, stop, targets.t1);
    o.note = "Continuation short: M/W/D down, pullback to EMA";
    return true;
  }

  private static bool tryBreakoutLong(
    double px,
    double? atr,
    double? volZ,
    RangeJsonDto? r20,
    TimeframeBlockDto d,
    out RuleOutcome o) {
    o = new RuleOutcome();
    if (atr is not { } atrV || r20 == null) {
      return false;
    }
    if (volZ is not { } vz || vz < VolZBreakoutMin) {
      return false;
    }
    var threshold = r20.High + BreakoutAtrFrac * atrV;
    if (px <= threshold) {
      return false;
    }
    var entry = px;
    var stop = r20.High;
    var targets = targetsLong(d, px, atrV, entry);
    o.trigger = $"Close > 20D high {r20.High:F2} + {BreakoutAtrFrac}×ATR; volZ {vz:F2}";
    o.invalidation = $"Lose breakout / close below ~{stop:F2}";
    o.t1 = targets.t1 ?? r20.High + atrV;
    o.t2 = targets.t2 ?? entry + 2 * atrV;
    o.rr = riskReward(entry, stop, o.t1);
    o.note = "Breakout long confirmed";
    return true;
  }

  private static bool tryBreakoutShort(
    double px,
    double? atr,
    double? volZ,
    RangeJsonDto? r20,
    TimeframeBlockDto d,
    out RuleOutcome o) {
    o = new RuleOutcome();
    if (atr is not { } atrV || r20 == null) {
      return false;
    }
    if (volZ is not { } vz || vz < VolZBreakoutMin) {
      return false;
    }
    var threshold = r20.Low - BreakoutAtrFrac * atrV;
    if (px >= threshold) {
      return false;
    }
    var entry = px;
    var stop = r20.Low;
    var targets = targetsShort(d, px, atrV, entry);
    o.trigger = $"Close < 20D low {r20.Low:F2} − {BreakoutAtrFrac}×ATR; volZ {vz:F2}";
    o.invalidation = $"Reclaim breakdown / close above ~{stop:F2}";
    o.t1 = targets.t1 ?? r20.Low - atrV;
    o.t2 = targets.t2 ?? entry - 2 * atrV;
    o.rr = riskReward(entry, stop, o.t1);
    o.note = "Breakout short (breakdown) confirmed";
    return true;
  }

  private static bool tryReversalLong(
    string dTrend,
    double? rsi,
    double? atr,
    double? ema20,
    LastCandleJsonDto? last,
    TimeframeBlockDto d,
    double px,
    out RuleOutcome o) {
    o = new RuleOutcome();
    if (dTrend != "down") {
      return false;
    }
    if (rsi is not { } rsiV || rsiV >= ReversalRsiLongMax) {
      return false;
    }
    if (atr is not { } atrV || last == null) {
      return false;
    }
    if (!bullishReversalWick(last)) {
      return false;
    }
    if (!atClusteredLevel(px, d, atrV)) {
      return false;
    }
    if (ema20 is { } e20 && px < e20) {
      o.note = "Await EMA20 reclaim for confirmation";
      return false;
    }
    var stop = nearestSupport(d, px, atrV);
    var targets = targetsLong(d, px, atrV, px);
    o.trigger = "Hammer / lower-wick reversal at clustered 1D level; EMA20 reclaimed";
    o.invalidation = stop is { } s ? $"Below support ~{s:F2}" : "Below reversal low";
    o.t1 = targets.t1;
    o.t2 = targets.t2;
    o.rr = riskReward(px, stop, targets.t1);
    o.note = "Reversal long";
    return true;
  }

  private static bool tryReversalShort(
    string dTrend,
    double? rsi,
    double? atr,
    double? ema20,
    LastCandleJsonDto? last,
    TimeframeBlockDto d,
    double px,
    out RuleOutcome o) {
    o = new RuleOutcome();
    if (dTrend != "up") {
      return false;
    }
    if (rsi is not { } rsiV || rsiV <= ReversalRsiShortMin) {
      return false;
    }
    if (atr is not { } atrV || last == null) {
      return false;
    }
    if (!bearishReversalWick(last)) {
      return false;
    }
    if (!atClusteredLevel(px, d, atrV)) {
      return false;
    }
    if (ema20 is { } e20 && px > e20) {
      o.note = "Await EMA20 loss for confirmation";
      return false;
    }
    var stop = nearestResistance(d, px, atrV);
    var targets = targetsShort(d, px, atrV, px);
    o.trigger = "Shooting-star / upper-wick reversal at clustered 1D level; below EMA20";
    o.invalidation = stop is { } s ? $"Above resistance ~{s:F2}" : "Above reversal high";
    o.t1 = targets.t1;
    o.t2 = targets.t2;
    o.rr = riskReward(px, stop, targets.t1);
    o.note = "Reversal short";
    return true;
  }

  private static bool higherLowOnDay(TimeframeBlockDto d) {
    var lows = d.SwingLows;
    if (lows.Count < 2) {
      return false;
    }
    return lows[^1].Price > lows[^2].Price;
  }

  private static bool lowerHighOnDay(TimeframeBlockDto d) {
    var highs = d.SwingHighs;
    if (highs.Count < 2) {
      return false;
    }
    return highs[^1].Price < highs[^2].Price;
  }

  private static bool bullishReversalWick(LastCandleJsonDto c) {
    return c.LowerWickPctOfRange is { } lw && lw >= WickReversalMin;
  }

  private static bool bearishReversalWick(LastCandleJsonDto c) {
    return c.UpperWickPctOfRange is { } uw && uw >= WickReversalMin;
  }

  private static bool atClusteredLevel(double px, TimeframeBlockDto d, double atr) {
    var tol = LevelAtrTol * atr;
    foreach (var lv in d.Levels) {
      if (Math.Abs(px - lv.Price) <= tol) {
        return true;
      }
    }
    return false;
  }

  private static double? nearestSupport(TimeframeBlockDto d, double px, double atr) {
    double? best = null;
    foreach (var s in d.SwingLows) {
      if (s.Price < px && (best == null || s.Price > best)) {
        best = s.Price;
      }
    }
    if (best != null) {
      return best;
    }
    foreach (var lv in d.Levels.Where(l => l.Price < px)) {
      if (best == null || lv.Price > best) {
        best = lv.Price;
      }
    }
    return best ?? px - atr;
  }

  private static double? nearestResistance(TimeframeBlockDto d, double px, double atr) {
    double? best = null;
    foreach (var s in d.SwingHighs) {
      if (s.Price > px && (best == null || s.Price < best)) {
        best = s.Price;
      }
    }
    if (best != null) {
      return best;
    }
    foreach (var lv in d.Levels.Where(l => l.Price > px)) {
      if (best == null || lv.Price < best) {
        best = lv.Price;
      }
    }
    return best ?? px + atr;
  }

  private static (double? t1, double? t2) targetsLong(
    TimeframeBlockDto d,
    double px,
    double atr,
    double entry) {
    double? t1 = null;
    foreach (var lv in d.Levels.Where(l => l.Price > px).OrderBy(l => l.Price)) {
      t1 = lv.Price;
      break;
    }
    if (t1 == null && d.Range20 != null) {
      t1 = d.Range20.High;
    }
    var t2 = entry + 2 * atr;
    return (t1, t2);
  }

  private static (double? t1, double? t2) targetsShort(
    TimeframeBlockDto d,
    double px,
    double atr,
    double entry) {
    double? t1 = null;
    foreach (var lv in d.Levels.Where(l => l.Price < px).OrderByDescending(l => l.Price)) {
      t1 = lv.Price;
      break;
    }
    if (t1 == null && d.Range20 != null) {
      t1 = d.Range20.Low;
    }
    var t2 = entry - 2 * atr;
    return (t1, t2);
  }

  private static double? riskReward(double entry, double? stop, double? target) {
    if (stop == null || target == null) {
      return null;
    }
    var risk = Math.Abs(entry - stop.Value);
    if (risk < 1e-9) {
      return null;
    }
    var reward = Math.Abs(target.Value - entry);
    return Math.Round(reward / risk, 2);
  }

  private static string watchReason(
    string m,
    string w,
    string d,
    double px,
    double? atr,
    double? ema20,
    double? ema50,
    double? adx,
    double? volZ,
    RangeJsonDto? r20,
    TimeframeBlockDto block) {
    var parts = new List<string> { "No rubric trigger" };
    if (atr is { } a && ema20 is { } e) {
      var dist = Math.Abs(px - e) / a;
      parts.Add($"~{dist:F1}×ATR from EMA20");
    }
    if (r20 != null && atr is { } a2) {
      parts.Add($"20D H/L {r20.High:F0}/{r20.Low:F0}");
    }
    if (!higherLowOnDay(block) && block.SwingLows.Count >= 2) {
      var sl = block.SwingLows;
      parts.Add($"HL swings {sl[^2].Price:F0}→{sl[^1].Price:F0}");
    }
    return string.Join("; ", parts);
  }

  private static string fmtPrice(double p) => $"{p:F2}";

  private static string trendGlyph(string t) => t switch {
    "up" => "+",
    "down" => "−",
    _ => "±",
  };
}
