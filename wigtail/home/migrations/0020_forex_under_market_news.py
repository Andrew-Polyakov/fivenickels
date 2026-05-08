# Add Forex as a real tree child of Market News (slug forex).

from django.db import migrations


def ensure_forex_child(apps, schema_editor):
    from home.models import TaxonomyTerm as RuntimeTaxonomyTerm
    from home.taxonomy import MARKET_NEWS_SLUG
    TaxonomyTerm = apps.get_model("home", "TaxonomyTerm")

    mn = TaxonomyTerm.objects.filter(slug=MARKET_NEWS_SLUG).first()
    if mn is None:
        return
    if TaxonomyTerm.objects.filter(slug="forex").exists():
        fx = TaxonomyTerm.objects.filter(slug="forex").first()
        siblings = TaxonomyTerm.objects.filter(
            path__startswith=mn.path, depth=(mn.depth + 1)
        ).order_by("path")
        step = siblings.count() if fx and fx.path.startswith(mn.path) else siblings.count() + 1
        TaxonomyTerm.objects.filter(slug="forex").update(
            name="Forex",
            sort_order=0,
            is_visible=True,
            path=RuntimeTaxonomyTerm._get_path(mn.path, mn.depth + 1, step),
            depth=mn.depth + 1,
            numchild=0,
        )
        TaxonomyTerm.objects.filter(pk=mn.pk).update(numchild=siblings.count())
        return
    siblings = TaxonomyTerm.objects.filter(
        path__startswith=mn.path, depth=(mn.depth + 1)
    ).order_by("path")
    child = TaxonomyTerm(
        name="Forex",
        slug="forex",
        sort_order=0,
        is_visible=True,
        path=RuntimeTaxonomyTerm._get_path(mn.path, mn.depth + 1, siblings.count() + 1),
        depth=mn.depth + 1,
        numchild=0,
    )
    child.save()
    TaxonomyTerm.objects.filter(pk=mn.pk).update(numchild=siblings.count() + 1)


def backwards_noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("home", "0019_taxonomy_category_featured_quad"),
    ]

    operations = [
        migrations.RunPython(ensure_forex_child, backwards_noop),
    ]
