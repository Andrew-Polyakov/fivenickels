# Retire taxonomy roots home + markets-data; add market-news + opinions; normalize paths.

from django.db import migrations


def forwards_market_news_hierarchy(apps, schema_editor):
    from home.gics_sectors import GICS_SECTOR_SLUGS
    from home.models import TaxonomyTerm

    # Historical model: live TaxonomyTerm.delete() would query related pages with the
    # current TaggedContentPage schema (columns that may not exist yet in this DB).
    TaxonomyTermHist = apps.get_model("home", "TaxonomyTerm")
    TaxonomyTermHist.objects.filter(slug__in=("home", "markets-data")).delete()

    def ensure_root(*, slug: str, name: str, sort_order: int) -> None:
        if TaxonomyTerm.objects.filter(slug=slug).exists():
            TaxonomyTerm.objects.filter(slug=slug).update(
                name=name,
                sort_order=sort_order,
                is_visible=True,
            )
            return
        last = TaxonomyTerm.get_last_root_node()
        if last is not None:
            last.add_sibling(
                "sorted-sibling",
                name=name,
                slug=slug,
                sort_order=sort_order,
                is_visible=True,
            )
        else:
            TaxonomyTerm.add_root(
                name=name,
                slug=slug,
                sort_order=sort_order,
                is_visible=True,
            )
        TaxonomyTerm.fix_tree()

    ensure_root(slug="market-news", name="Market News", sort_order=5)
    ensure_root(slug="opinions", name="Opinions", sort_order=8)
    ensure_root(slug="personal-finance", name="Personal Finance", sort_order=9)

    TaxonomyTerm.objects.filter(slug__in=GICS_SECTOR_SLUGS).update(is_visible=True)

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
        ("home", "0015_article_body_markdown_block"),
    ]

    operations = [
        migrations.RunPython(forwards_market_news_hierarchy, backwards_noop),
    ]
