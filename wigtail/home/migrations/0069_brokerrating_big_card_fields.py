from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("home", "0068_markettickerrow_exchange_carousel_pinned"),
    ]

    operations = [
        migrations.AddField(
            model_name="brokerrating",
            name="logo_rect_url",
            field=models.URLField(blank=True, help_text="Rectangular logo URL (preferred on big trader cards)", max_length=500),
        ),
        migrations.AddField(
            model_name="brokerrating",
            name="logo_square_url",
            field=models.URLField(blank=True, help_text="Square logo URL", max_length=500),
        ),
        migrations.AddField(
            model_name="brokerrating",
            name="overview",
            field=models.TextField(blank=True, help_text="Plain-text overview for big trader cards"),
        ),
        migrations.AddField(
            model_name="brokerrating",
            name="category_ratings",
            field=models.JSONField(
                blank=True,
                default=list,
                help_text='List of {"label": "Cost", "score": 4.5} for category score rows',
            ),
        ),
    ]
