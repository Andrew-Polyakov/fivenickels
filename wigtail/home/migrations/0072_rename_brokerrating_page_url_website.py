from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("home", "0071_contenttag_backfill_empty_slugs"),
    ]

    operations = [
        migrations.RenameField(
            model_name="brokerrating",
            old_name="page_url",
            new_name="website",
        ),
        migrations.AlterField(
            model_name="brokerrating",
            name="website",
            field=models.URLField(
                max_length=500,
                blank=True,
                help_text="Official broker website URL",
            ),
        ),
    ]
