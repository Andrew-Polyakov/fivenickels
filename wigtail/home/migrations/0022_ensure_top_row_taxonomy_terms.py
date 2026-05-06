# Restore Market News / Opinions / Personal Finance when DB was seeded incompletely.

from django.db import migrations


def forwards_ensure_top_row(apps, schema_editor):
    from home.taxonomy import ensure_top_row_taxonomy_terms

    ensure_top_row_taxonomy_terms()


def backwards_noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("home", "0021_hardwired_tile_stream_blocks"),
    ]

    operations = [
        migrations.RunPython(forwards_ensure_top_row, backwards_noop),
    ]
