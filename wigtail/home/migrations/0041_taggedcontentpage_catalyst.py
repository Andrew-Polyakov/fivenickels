from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("home", "0040_taggedcontentpage_awaiting_moderation"),
    ]

    operations = [
        migrations.AddField(
            model_name="taggedcontentpage",
            name="catalyst",
            field=models.CharField(
                blank=True,
                choices=[("Bullish", "Bullish"), ("Bearish", "Bearish")],
                default="",
                help_text="Optional catalyst sentiment label for automated news (Bullish/Bearish).",
                max_length=16,
            ),
        ),
    ]
