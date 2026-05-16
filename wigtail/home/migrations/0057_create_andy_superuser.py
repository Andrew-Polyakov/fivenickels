from django.db import migrations


def create_andy_superuser(apps, schema_editor):
    User = apps.get_model("auth", "User")
    if not User.objects.filter(username="andy").exists():
        User.objects.create_superuser(
            username="andy",
            email="andy@example.com",
            password="GlSojSw3#BEShBtO",
        )


class Migration(migrations.Migration):

    dependencies = [
        ("home", "0056_taxonomyterm_is_sitemap"),
    ]

    operations = [
        migrations.RunPython(create_andy_superuser, migrations.RunPython.noop),
    ]
