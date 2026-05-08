from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("home", "0026_taggedcontentpage_article_priority_expiry"),
    ]

    operations = [
        migrations.AddField(
            model_name="taxonomyterm",
            name="is_nav",
            field=models.BooleanField(
                default=True,
                help_text="If unchecked, this term is hidden from public nav but still visible to editors.",
            ),
        ),
    ]
