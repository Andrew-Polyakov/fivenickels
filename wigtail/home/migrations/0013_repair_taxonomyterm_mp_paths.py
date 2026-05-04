# Repair TaxonomyTerm MP_Node paths/depth after 0011 used add_root on a tree that already had
# manually assigned paths, which left GICS rows with invalid depth/path and broke get_root_nodes().

from django.db import migrations


def repair_taxonomy_mp_paths(apps, schema_editor):
    from home.models import TaxonomyTerm

    terms = list(
        TaxonomyTerm.objects.all().order_by("sort_order", "name", "slug")
    )
    if not terms:
        return
    # Two-phase reassignment avoids UNIQUE(path) clashes while rows still hold old paths.
    # MP_Node root paths must be steplen characters per level (_get_path), not raw _int2str.
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
        ("home", "0012_careers_cookies_pages"),
    ]

    operations = [
        migrations.RunPython(repair_taxonomy_mp_paths, backwards_noop),
    ]
