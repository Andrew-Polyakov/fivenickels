from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("home", "0067_brokerrating_slug"),
    ]

    operations = [
        migrations.AddField(
            model_name="markettickerrow",
            name="carousel_pinned",
            field=models.BooleanField(
                default=False,
                help_text="Always include in header carousel (staff pin).",
            ),
        ),
        migrations.AddField(
            model_name="markettickerrow",
            name="exchange",
            field=models.CharField(
                blank=True,
                db_index=True,
                help_text="Alpaca listing exchange (NASDAQ, NYSE, …).",
                max_length=32,
            ),
        ),
        migrations.AddField(
            model_name="markettickerrow",
            name="tradable",
            field=models.BooleanField(
                default=True,
                help_text="False when Alpaca marks asset non-tradable.",
            ),
        ),
    ]
