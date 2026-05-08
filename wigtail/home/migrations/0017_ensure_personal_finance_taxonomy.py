# If 0016 ran before personal-finance was created via ensure_root, add the term here.

from django.db import migrations


def ensure_personal_finance(apps, schema_editor):
    from home.models import TaxonomyTerm as RuntimeTaxonomyTerm
    TaxonomyTerm = apps.get_model("home", "TaxonomyTerm")

    if TaxonomyTerm.objects.filter(slug="personal-finance").exists():
        TaxonomyTerm.objects.filter(slug="personal-finance").update(
            name="Personal Finance",
            sort_order=9,
            is_visible=True,
        )
        return
    TaxonomyTerm.objects.create(
        name="Personal Finance",
        slug="personal-finance",
        sort_order=9,
        is_visible=True,
        path=RuntimeTaxonomyTerm._get_path(None, 1, TaxonomyTerm.objects.count() + 1),
        depth=1,
        numchild=0,
    )


def backwards_noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("home", "0016_market_news_hierarchy"),
    ]

    operations = [
        migrations.RunPython(ensure_personal_finance, backwards_noop),
    ]
