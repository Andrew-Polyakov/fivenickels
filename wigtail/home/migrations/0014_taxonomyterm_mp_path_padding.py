# Follow-up to 0013: that migration first used _int2str() for paths, which yields strings shorter than
# steplen so fix_tree sets depth=0 and get_root_nodes() is empty. Re-assign padded root paths.

from django.db import migrations


def repair_padded_root_paths(apps, schema_editor):
    from home.models import TaxonomyTerm

    terms = list(
        TaxonomyTerm.objects.all().order_by("sort_order", "name", "slug")
    )
    if not terms:
        return
    offset = len(terms) + 50
    for i, t in enumerate(terms, start=1):
        TaxonomyTerm.objects.filter(pk=t.pk).update(
            path=TaxonomyTerm._get_path(None, 1, offset + i),
            depth=1,
            numchild=0,
        )
    for i, t in enumerate(terms, start=1):
        TaxonomyTerm.objects.filter(pk=t.pk).update(
            path=TaxonomyTerm._get_path(None, 1, i),
            depth=1,
            numchild=0,
        )
    TaxonomyTerm.fix_tree()


def backwards_noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("home", "0013_repair_taxonomyterm_mp_paths"),
    ]

    operations = [
        migrations.RunPython(repair_padded_root_paths, backwards_noop),
    ]
