namespace StockCrawler;

/// <summary>Loads Alpaca API keys: walks up for .apca / alpacacredentials / .env, then env vars.</summary>
internal static class Credentials
{
    /// <summary>Loads the first <c>.env</c> found walking up from cwd, then the app base path.</summary>
    public static void tryLoadDotEnv()
    {
        var path = findEnvFilePath();
        if (path == null) {
            return;
        }
        try {
            global::DotNetEnv.Env.NoClobber().Load(path);
        } catch (Exception ex) {
            Console.Error.WriteLine("Warning: could not load .env at " + path + ": " + ex.Message);
        }
    }

    public static string? findEnvFilePath() {
        return findFirstCredentialsFilePath(onlyFileName: ".env");
    }

    /// <summary>Walks from cwd and from app base; in each directory prefers <c>.apca</c>, <c>alpacacredentials</c>, <c>.env</c> (in that order).</summary>
    public static string? findFirstCredentialsFilePath(string? onlyFileName = null) {
        IReadOnlyList<string> fileNames;
        if (onlyFileName != null) {
            fileNames = new[] { onlyFileName };
        } else {
            fileNames = new[] { ".apca", "alpacacredentials", ".env" };
        }
        foreach (var start in new[] { Directory.GetCurrentDirectory(), AppContext.BaseDirectory }) {
            if (string.IsNullOrEmpty(start)) {
                continue;
            }
            for (var d = new DirectoryInfo(Path.GetFullPath(start));
                 d != null;
                 d = d.Parent) {
                foreach (var name in fileNames) {
                    var candidate = Path.Combine(d.FullName, name);
                    if (File.Exists(candidate)) {
                        return candidate;
                    }
                }
            }
        }
        return null;
    }

    public static (string? keyId, string? keySecret, bool? useLive) tryReadCredentialsFromFile(string path) {
        string? keyId = null;
        string? keySecret = null;
        bool? useLive = null;
        foreach (var raw in File.ReadAllLines(path)) {
            if (!tryParseCredentialLine(raw, out var k, out var v)) {
                continue;
            }
            switch (k) {
            case "APCA_API_KEY_ID" or "ALPACA_API_KEY_ID":
                keyId = v;
                break;
            case "APCA_API_SECRET_KEY" or "ALPACA_API_SECRET_KEY":
                keySecret = v;
                break;
            case "ALPACA_ENV" or "APCA_ALPACA_ENV":
                useLive = isLiveString(v) ? true : (isPaperString(v) ? (bool?)false : useLive);
                break;
            case "APCA_TRADING_LIVE" or "ALPACA_LIVE":
                useLive = isTruthyLiveFlag(v) ? true : (isFalsyOrPaperFlag(v) ? (bool?)false : useLive);
                break;
            }
        }
        return (keyId, keySecret, useLive);
    }

    private static bool tryParseCredentialLine(string rawLine, out string key, out string value) {
        key = "";
        value = "";
        var line = rawLine.Trim();
        if (line.Length == 0) {
            return false;
        }
        if (line[0] == '#') {
            line = line.Substring(1).Trim();
            if (line.Length == 0) {
                return false;
            }
        }
        var eq = line.IndexOf('=');
        if (eq <= 0) {
            return false;
        }
        key = line.Substring(0, eq).Trim();
        value = line.Substring(eq + 1).Trim();
        if (value.Length >= 2 && value[0] == '"' && value[^1] == '"') {
            value = value.Substring(1, value.Length - 2);
        }
        if (key.Length == 0) {
            return false;
        }
        if (value.Length == 0) {
            return false;
        }
        return true;
    }

    private static bool isLiveString(string v) {
        return string.Equals(v.Trim(), "live", StringComparison.OrdinalIgnoreCase);
    }

    private static bool isPaperString(string v) {
        return string.Equals(v.Trim(), "paper", StringComparison.OrdinalIgnoreCase);
    }

    private static bool isTruthyLiveFlag(string v) {
        var t = v.Trim();
        if (t.Length == 0) {
            return false;
        }
        if (t == "1" || t.Equals("true", StringComparison.OrdinalIgnoreCase) || t.Equals("yes", StringComparison.OrdinalIgnoreCase) || t.Equals("live", StringComparison.OrdinalIgnoreCase)) {
            return true;
        }
        return false;
    }

    private static bool isFalsyOrPaperFlag(string v) {
        var t = v.Trim();
        if (t == "0" || t.Equals("false", StringComparison.OrdinalIgnoreCase) || t.Equals("no", StringComparison.OrdinalIgnoreCase) || t.Equals("paper", StringComparison.OrdinalIgnoreCase)) {
            return true;
        }
        return false;
    }

    public static (string? keyId, string? keySecret, bool useLive) load() {
        var filePath = findFirstCredentialsFilePath(onlyFileName: null);
        string? fId = null;
        string? fSec = null;
        bool? fLive = null;
        if (filePath != null) {
            (fId, fSec, fLive) = tryReadCredentialsFromFile(filePath);
        }
        if (!string.IsNullOrWhiteSpace(fId) && !string.IsNullOrWhiteSpace(fSec)) {
            return (fId, fSec, fLive ?? resolveUseLiveFromEnvironment() ?? false);
        }
        tryLoadDotEnv();
        var keyId = fId ?? getEnvId();
        var keySecret = fSec ?? getEnvSecret();
        return (keyId, keySecret, fLive ?? resolveUseLiveFromEnvironment() ?? false);
    }

    public static string? getEnvId() {
        return Environment.GetEnvironmentVariable("APCA_API_KEY_ID")
            ?? Environment.GetEnvironmentVariable("ALPACA_API_KEY_ID");
    }

    public static string? getEnvSecret() {
        return Environment.GetEnvironmentVariable("APCA_API_SECRET_KEY")
            ?? Environment.GetEnvironmentVariable("ALPACA_API_SECRET_KEY");
    }

    public static bool? resolveUseLiveFromEnvironment() {
        if (getBoolEnv("APCA_TRADING_LIVE") is { } a) {
            return a;
        }
        if (getBoolEnv("ALPACA_LIVE") is { } b) {
            return b;
        }
        if (getAlcapaEnvFromString(Environment.GetEnvironmentVariable("ALPACA_ENV")) is { } c) {
            return c;
        }
        if (getAlcapaEnvFromString(Environment.GetEnvironmentVariable("APCA_ALPACA_ENV")) is { } d) {
            return d;
        }
        return null;
    }

    private static bool? getBoolEnv(string name) {
        var s = Environment.GetEnvironmentVariable(name);
        if (string.IsNullOrWhiteSpace(s)) {
            return null;
        }
        if (s == "1" || s.Equals("true", StringComparison.OrdinalIgnoreCase) || s.Equals("yes", StringComparison.OrdinalIgnoreCase)) {
            return true;
        }
        if (s == "0" || s.Equals("false", StringComparison.OrdinalIgnoreCase) || s.Equals("no", StringComparison.OrdinalIgnoreCase)) {
            return false;
        }
        return null;
    }

    private static bool? getAlcapaEnvFromString(string? s) {
        if (string.IsNullOrWhiteSpace(s)) {
            return null;
        }
        if (isLiveString(s!)) {
            return true;
        }
        if (isPaperString(s!)) {
            return false;
        }
        return null;
    }
}
