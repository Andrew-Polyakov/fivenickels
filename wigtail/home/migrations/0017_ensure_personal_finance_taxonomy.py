# If 0016 ran before personal-finance was created via ensure_root, add the term here.

from django.db import migrations


def ensure_personal_finance(apps, schema_editor):
    from home.models import TaxonomyTerm

    if TaxonomyTerm.objects.filter(slug="personal-finance").exists():
        TaxonomyTerm.objects.filter(slug="personal-finance").update(
            name="Personal Finance",
            sort_order=9,
            is_visible=True,
        )
        return
    last = TaxonomyTerm.get_last_root_node()
    if last is not None:
        last.add_sibling(
            "sorted-sibling",
            name="Personal Finance",
            slug="personal-finance",
            sort_order=9,
            is_visible=True,
        )
    else:
        TaxonomyTerm.add_root(
            name="Personal Finance",
            slug="personal-finance",
            sort_order=9,
            is_visible=True,
        )
    TaxonomyTerm.fix_tree()


def backwards_noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("home", "0016_market_news_hierarchy"),
    ]

    operations = [
        migrations.RunPython(ensure_personal_finance, backwards_noop),
    ]
