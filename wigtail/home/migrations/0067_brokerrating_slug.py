from django.db import migrations, models
from django.utils.text import slugify


def backfill_broker_slugs(apps, schema_editor):
    BrokerRating = apps.get_model("home", "BrokerRating")
    used = set(
        BrokerRating.objects.exclude(slug__isnull=True)
        .exclude(slug="")
        .values_list("slug", flat=True)
    )
    for broker in BrokerRating.objects.order_by("rank", "id"):
        if broker.slug:
            continue
        base_slug = slugify(broker.broker_name)[:200] or f"broker-{broker.rank}"
        candidate = base_slug
        suffix = 2
        while candidate in used:
            candidate = f"{base_slug}-{suffix}"
            suffix += 1
        broker.slug = candidate
        broker.save(update_fields=["slug"])
        used.add(candidate)


class Migration(migrations.Migration):
    dependencies = [
        ("home", "0066_rename_tile_preview_lede_hero_description"),
    ]

    operations = [
        migrations.AddField(
            model_name="brokerrating",
            name="slug",
            field=models.SlugField(blank=True, max_length=220, null=True, unique=True),
        ),
        migrations.RunPython(backfill_broker_slugs, migrations.RunPython.noop),
    ]
