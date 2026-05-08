from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("home", "0029_brokerrating"),
    ]

    operations = [
        migrations.AddField(
            model_name="brokerrating",
            name="favicon_url",
            field=models.URLField(blank=True, help_text="Favicon image URL", max_length=500),
        ),
    ]
