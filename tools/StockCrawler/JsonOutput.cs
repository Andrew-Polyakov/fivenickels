using System.Text.Json;
using System.Text.Json.Serialization;

namespace StockCrawler;

internal static class JsonOutput
{
    public static readonly JsonSerializerOptions Options = new() {
        WriteIndented = true,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    public static void writeToStdout<T>(T dto) {
        Console.WriteLine(JsonSerializer.Serialize(dto, Options));
    }
}
