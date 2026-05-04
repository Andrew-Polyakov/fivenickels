# Add Forex as a real tree child of Market News (slug forex).

from django.db import migrations


def ensure_forex_child(apps, schema_editor):
    from home.models import TaxonomyTerm
    from home.taxonomy import MARKET_NEWS_SLUG

    mn = TaxonomyTerm.objects.filter(slug=MARKET_NEWS_SLUG).first()
    if mn is None:
        return
    if TaxonomyTerm.objects.filter(slug="forex").exists():
        TaxonomyTerm.objects.filter(slug="forex").update(
            name="Forex",
            sort_order=0,
            is_visible=True,
        )
        TaxonomyTerm.fix_tree()
        return
    child = TaxonomyTerm(
        name="Forex",
        slug="forex",
        sort_order=0,
        is_visible=True,
    )
    mn.add_child(instance=child)
    TaxonomyTerm.fix_tree()


def backwards_noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("home", "0019_taxonomy_category_featured_quad"),
    ]

    operations = [
        migrations.RunPython(ensure_forex_child, backwards_noop),
    ]
