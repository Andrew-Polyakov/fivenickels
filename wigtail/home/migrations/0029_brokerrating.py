from django.db import migrations, models


SEED_BROKERS = [
    (1, "IG Group", 4.9, "active", 4821, "ECN/STP", "FCA, ASIC, MAS", 250, "1:200"),
    (2, "Saxo Bank", 4.8, "active", 3654, "Market Maker", "FCA, DFSA, MAS", 500, "1:200"),
    (3, "CMC Markets", 4.7, "active", 3102, "Market Maker", "FCA, ASIC, MAS", 0, "1:500"),
    (4, "Interactive Brokers", 4.7, "active", 2987, "ECN", "SEC, FINRA, FCA", 0, "1:40"),
    (5, "XTB", 4.6, "active", 2541, "Market Maker", "FCA, CySEC, KNF", 0, "1:500"),
    (6, "Pepperstone", 4.6, "active", 2318, "ECN/STP", "FCA, ASIC, DFSA", 200, "1:500"),
    (7, "OANDA", 4.5, "active", 2204, "Market Maker", "FCA, CFTC, IIROC", 0, "1:100"),
    (8, "eToro", 4.4, "active", 5210, "Market Maker", "FCA, CySEC, ASIC", 50, "1:30"),
    (9, "Admiral Markets", 4.3, "active", 1876, "ECN/STP", "FCA, ASIC, CySEC", 100, "1:500"),
    (10, "FXCM", 4.2, "active", 1654, "Market Maker", "FCA, ASIC, FSCA", 50, "1:400"),
]


def seed_brokers(apps, schema_editor):
    BrokerRating = apps.get_model("home", "BrokerRating")
    for rank, name, rating, status, reviews, btype, regulation, min_dep, leverage in SEED_BROKERS:
        BrokerRating.objects.create(
            rank=rank,
            broker_name=name,
            overall_rating=rating,
            status=status,
            reviews=reviews,
            broker_type=btype,
            regulation=regulation,
            min_deposit=min_dep,
            leverage=leverage,
        )


def unseed_brokers(apps, schema_editor):
    BrokerRating = apps.get_model("home", "BrokerRating")
    BrokerRating.objects.all().delete()


class Migration(migrations.Migration):

    dependencies = [
        ("home", "0028_alter_homepage_body_alter_subsectionindexpage_intro_and_more"),
    ]

    operations = [
        migrations.CreateModel(
            name="BrokerRating",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("rank", models.PositiveIntegerField()),
                ("broker_name", models.CharField(max_length=200)),
                ("overall_rating", models.DecimalField(decimal_places=1, max_digits=3)),
                ("status", models.CharField(
                    choices=[("active", "Active"), ("inactive", "Inactive"), ("restricted", "Restricted")],
                    default="active",
                    max_length=20,
                )),
                ("reviews", models.PositiveIntegerField(default=0)),
                ("broker_type", models.CharField(max_length=100)),
                ("regulation", models.CharField(max_length=200)),
                ("min_deposit", models.PositiveIntegerField(help_text="Minimum deposit in USD")),
                ("leverage", models.CharField(help_text='e.g. "1:500"', max_length=20)),
            ],
            options={"ordering": ["rank"], "verbose_name": "broker rating", "verbose_name_plural": "broker ratings"},
        ),
        migrations.RunPython(seed_brokers, reverse_code=unseed_brokers),
    ]
