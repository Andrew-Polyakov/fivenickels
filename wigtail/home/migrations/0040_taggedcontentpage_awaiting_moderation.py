from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("home", "0039_taggedcontentpage_author_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="taggedcontentpage",
            name="awaiting_moderation",
            field=models.BooleanField(
                db_index=True,
                default=False,
                help_text="Queued for profile moderation review until approved or published.",
            ),
        ),
    ]
