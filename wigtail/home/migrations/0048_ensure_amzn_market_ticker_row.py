from django.db import migrations
from django.db.models import Max


def ensure_amzn_market_ticker_row(apps, schema_editor):
    MarketTickerRow = apps.get_model("home", "MarketTickerRow")
    row = MarketTickerRow.objects.filter(symbol="AMZN").first()
    if row is not None:
        if not row.enabled:
            row.enabled = True
            row.save(update_fields=["enabled"])
        return
    agg = MarketTickerRow.objects.aggregate(m=Max("sort_order"))
    next_order = (agg["m"] or 0) + 1
    MarketTickerRow.objects.create(symbol="AMZN", sort_order=next_order, enabled=True)


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("home", "0047_stock_bars_cadence_limit"),
    ]

    operations = [
        migrations.RunPython(ensure_amzn_market_ticker_row, noop_reverse),
    ]
