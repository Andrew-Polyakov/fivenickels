# Restore Market News / Opinions / Personal Finance when DB was seeded incompletely.

from django.db import migrations


def forwards_ensure_top_row(apps, schema_editor):
    from home.models import TaxonomyTerm as RuntimeTaxonomyTerm
    TaxonomyTerm = apps.get_model("home", "TaxonomyTerm")

    targets = (
        ("market-news", "Market News", 5),
        ("opinions", "Opinions", 8),
        ("personal-finance", "Personal Finance", 9),
    )
    for slug, name, sort_order in targets:
        if TaxonomyTerm.objects.filter(slug=slug).exists():
            TaxonomyTerm.objects.filter(slug=slug).update(
                name=name,
                sort_order=sort_order,
                is_visible=True,
            )
            continue
        TaxonomyTerm.objects.create(
            name=name,
            slug=slug,
            sort_order=sort_order,
            is_visible=True,
            path=RuntimeTaxonomyTerm._get_path(None, 1, 1000 + TaxonomyTerm.objects.count() + 1),
            depth=1,
            numchild=0,
        )


def backwards_noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("home", "0021_hardwired_tile_stream_blocks"),
    ]

    operations = [
        migrations.RunPython(forwards_ensure_top_row, backwards_noop),
    ]
