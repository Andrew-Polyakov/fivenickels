from django.core.management.base import BaseCommand
from django.utils.text import slugify

from home.models import BrokerRating

BROKERS = [
    {"rank": 1, "broker_name": "FxPro", "overall_rating": 4.5, "status": "active", "reviews": 879, "broker_type": "Broker, NDD", "regulation": "FCA, SCB", "min_deposit": 100, "leverage": "1:500", "favicon_url": "https://www.google.com/s2/favicons?domain=fxpro.com&sz=32"},
    {"rank": 2, "broker_name": "XM", "overall_rating": 4.0, "status": "active", "reviews": 528, "broker_type": "Broker", "regulation": "CySEC, FSC, DFS", "min_deposit": 5, "leverage": "1:1000", "favicon_url": "https://www.google.com/s2/favicons?domain=xm.com&sz=32"},
    {"rank": 3, "broker_name": "Octa", "overall_rating": 4.0, "status": "active", "reviews": 306, "broker_type": "Broker", "regulation": "CySEC, MISA, FSA", "min_deposit": 25, "leverage": "1:1000", "favicon_url": "https://www.google.com/s2/favicons?domain=octafx.com&sz=32"},
    {"rank": 4, "broker_name": "IronFX", "overall_rating": 4.0, "status": "active", "reviews": 388, "broker_type": "MM, ECN, STP", "regulation": "FCA, FSCA", "min_deposit": 50, "leverage": "1:30", "favicon_url": "https://www.google.com/s2/favicons?domain=ironfx.com&sz=32"},
    {"rank": 5, "broker_name": "Just2Trade", "overall_rating": 4.0, "status": "active", "reviews": 124, "broker_type": "Broker", "regulation": "CySEC, NFA, FINRA", "min_deposit": 100, "leverage": "1:500", "favicon_url": "https://www.google.com/s2/favicons?domain=just2trade.com&sz=32"},
    {"rank": 6, "broker_name": "T4Trade", "overall_rating": 4.0, "status": "active", "reviews": 166, "broker_type": "ECN, STP, MM", "regulation": "Seychelles FSA", "min_deposit": 50, "leverage": "1:1000", "favicon_url": "https://www.t4trade.com/wp-content/uploads/2021/10/T4T-Favicon-256.png"},
    {"rank": 7, "broker_name": "Riverquode", "overall_rating": 4.0, "status": "active", "reviews": 0, "broker_type": "CFD Broker", "regulation": "FSCA", "min_deposit": 1, "leverage": "1:400", "favicon_url": "https://www.riverquode.com/wp-content/uploads/2025/04/cropped-Frame-54070696-32x32.png"},
    {"rank": 8, "broker_name": "FXCC", "overall_rating": 4.0, "status": "active", "reviews": 269, "broker_type": "ECN, STP", "regulation": "CySEC, MISA", "min_deposit": 1, "leverage": "1:500", "favicon_url": "https://www.google.com/s2/favicons?domain=fxcc.com&sz=32"},
    {"rank": 9, "broker_name": "FXCess", "overall_rating": 4.0, "status": "active", "reviews": 68, "broker_type": "MM, ECN, STP", "regulation": "N/A", "min_deposit": 10, "leverage": "1:1000", "favicon_url": "https://www.fxcess.com/wp-content/uploads/2022/02/fxcess-favicon.png"},
    {"rank": 10, "broker_name": "Fintana", "overall_rating": 3.5, "status": "active", "reviews": 0, "broker_type": "CFD Broker", "regulation": "FSC Mauritius", "min_deposit": 1, "leverage": "1:400", "favicon_url": "https://www.fintana.com/wp-content/uploads/2024/12/cropped-Favicon-32x32.png"},
]


class Command(BaseCommand):
    help = "Replace BrokerRating table with top-10 brokers scraped from forex-ratings.com"

    def handle(self, *args, **options):
        deleted, _ = BrokerRating.objects.all().delete()
        self.stdout.write(f"Deleted {deleted} existing rows.")
        slug_counts: dict[str, int] = {}
        records = []
        for broker in BROKERS:
            broker_data = {
                key: value
                for key, value in broker.items()
                if key in {
                    "rank",
                    "broker_name",
                    "overall_rating",
                    "reviews",
                    "broker_type",
                    "regulation",
                    "min_deposit",
                    "leverage",
                    "favicon_url",
                    "website",
                    "best_for",
                }
            }
            base_slug = slugify(broker_data.get("broker_name", ""))[:200] or f"broker-{broker_data.get('rank', 0)}"
            count = slug_counts.get(base_slug, 0) + 1
            slug_counts[base_slug] = count
            broker_data["slug"] = base_slug if count == 1 else f"{base_slug}-{count}"
            records.append(BrokerRating(**broker_data))
        BrokerRating.objects.bulk_create(records)
        self.stdout.write(self.style.SUCCESS(f"Inserted {len(BROKERS)} brokers."))
