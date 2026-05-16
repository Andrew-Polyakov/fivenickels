from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('home', '0055_bento_forex_market_movers_tiles'),
    ]

    operations = [
        migrations.AddField(
            model_name='taxonomyterm',
            name='is_sitemap',
            field=models.BooleanField(
                default=False,
                help_text='If checked, this term appears in the site map navigation.',
            ),
        ),
    ]
