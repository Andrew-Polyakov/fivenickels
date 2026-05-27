from django.db import migrations
from django.utils.text import slugify


def backfill_empty_contenttag_slugs(apps, schema_editor):
    ContentTag = apps.get_model("home", "ContentTag")
    for tag in ContentTag.objects.filter(slug=""):
        base = slugify(tag.name)[:200] or "tag"
        candidate = base
        suffix = 2
        while (
            ContentTag.objects.filter(slug=candidate)
            .exclude(pk=tag.pk)
            .exists()
        ):
            candidate = f"{base}-{suffix}"
            suffix += 1
        tag.slug = candidate
        tag.save(update_fields=["slug"])


class Migration(migrations.Migration):

    dependencies = [
        ("home", "0070_big_trader_card_block"),
    ]

    operations = [
        migrations.RunPython(
            backfill_empty_contenttag_slugs,
            migrations.RunPython.noop,
        ),
    ]
