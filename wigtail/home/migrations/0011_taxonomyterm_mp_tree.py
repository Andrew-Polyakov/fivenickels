# TaxonomyTerm: treebeard MP_Node tree, widgets, nav fields, seed Home/Markets roots.

import django.db.models.deletion
import wagtail.fields
from django.db import migrations, models

from home.blocks import MAIN_SITE_STREAMBLOCK


def _sort_key_gics_then_name(term):
    from home.gics_sectors import GICS_SECTOR_ORDER, GICS_SECTOR_SLUGS

    if term.slug in GICS_SECTOR_SLUGS:
        return (0, GICS_SECTOR_ORDER[term.slug], term.slug)
    return (1, 0, term.name)


def forwards_populate_tree_and_seed(apps, schema_editor):
    from home.gics_sectors import GICS_SECTOR_ORDER, GICS_SECTOR_SLUGS
    from home.models import (
        HomePage as RuntimeHomePage,
        SubsectionIndexPage as RuntimeSubsectionIndexPage,
    )
    from home.models import TaxonomyTerm as RuntimeTaxonomyTerm
    TaxonomyTerm = apps.get_model("home", "TaxonomyTerm")
    Page = apps.get_model("wagtailcore", "Page")

    nodes = sorted(TaxonomyTerm.objects.all(), key=_sort_key_gics_then_name)
    for node in nodes:
        if node.slug in GICS_SECTOR_SLUGS:
            node.sort_order = 10 + GICS_SECTOR_ORDER[node.slug]
    TaxonomyTerm.objects.bulk_update(nodes, ["sort_order"])

    nodes = sorted(TaxonomyTerm.objects.all(), key=_sort_key_gics_then_name)
    for i, node in enumerate(nodes, start=1):
        node.path = RuntimeTaxonomyTerm._get_path(None, 1, i)
        node.depth = 1
        node.numchild = 0
    TaxonomyTerm.objects.bulk_update(nodes, ["path", "depth", "numchild"])

    hp = RuntimeHomePage.objects.live().public().first()

    def _next_root_path():
        return RuntimeTaxonomyTerm._get_path(None, 1, TaxonomyTerm.objects.count() + 1)

    if hp and not TaxonomyTerm.objects.filter(slug="home").exists():
        TaxonomyTerm.objects.create(
            name="Home",
            slug="home",
            sort_order=0,
            is_visible=True,
            link_page_id=Page.objects.filter(pk=hp.pk).values_list("pk", flat=True).first(),
            path=_next_root_path(),
            depth=1,
            numchild=0,
        )

    if hp and not TaxonomyTerm.objects.filter(slug="markets-data").exists():
        TaxonomyTerm.objects.create(
            name="Markets data",
            slug="markets-data",
            sort_order=1,
            is_visible=True,
            link_page_id=getattr(hp, "markets_data_link_id", None),
            path=_next_root_path(),
            depth=1,
            numchild=0,
        )

    for idx in RuntimeSubsectionIndexPage.objects.all():
        TaxonomyTerm.objects.filter(pk=idx.section_term_id).update(
            link_page_id=idx.page_ptr_id
        )


def backwards_noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("home", "0010_main_site_markdown_block"),
        ("wagtailcore", "0096_referenceindex_referenceindex_source_object_and_more"),
        ("wagtailimages", "0027_image_description"),
    ]

    operations = [
        migrations.AddField(
            model_name="taxonomyterm",
            name="path",
            field=models.CharField(max_length=255, unique=True, null=True),
        ),
        migrations.AddField(
            model_name="taxonomyterm",
            name="depth",
            field=models.PositiveIntegerField(null=True),
        ),
        migrations.AddField(
            model_name="taxonomyterm",
            name="numchild",
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.AddField(
            model_name="taxonomyterm",
            name="widgets",
            field=wagtail.fields.StreamField(
                MAIN_SITE_STREAMBLOCK,
                blank=True,
                use_json_field=True,
            ),
        ),
        migrations.AddField(
            model_name="taxonomyterm",
            name="link_page",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="+",
                to="wagtailcore.page",
            ),
        ),
        migrations.AddField(
            model_name="taxonomyterm",
            name="is_visible",
            field=models.BooleanField(default=True),
        ),
        migrations.AddField(
            model_name="taxonomyterm",
            name="sort_order",
            field=models.PositiveSmallIntegerField(default=0),
        ),
        migrations.AddField(
            model_name="taxonomyterm",
            name="parent_for_create",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="+",
                to="home.taxonomyterm",
                help_text="When creating a new term, optionally pick a parent. Ignored after save.",
            ),
        ),
        migrations.AlterModelOptions(
            name="taxonomyterm",
            options={
                "verbose_name": "taxonomy term",
                "verbose_name_plural": "taxonomy terms",
            },
        ),
        migrations.RunPython(forwards_populate_tree_and_seed, backwards_noop),
        migrations.AlterField(
            model_name="taxonomyterm",
            name="path",
            field=models.CharField(max_length=255, unique=True),
        ),
        migrations.AlterField(
            model_name="taxonomyterm",
            name="depth",
            field=models.PositiveIntegerField(),
        ),
    ]
