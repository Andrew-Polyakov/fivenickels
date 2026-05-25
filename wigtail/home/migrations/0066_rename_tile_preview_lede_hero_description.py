from django.db import migrations, models
import wagtailmarkdown.fields


class Migration(migrations.Migration):

    dependencies = [
        ("home", "0065_bento_article_carousel_auto_scroll"),
    ]

    operations = [
        migrations.RenameField(
            model_name="taggedcontentpage",
            old_name="tile_preview",
            new_name="lede",
        ),
        migrations.AddField(
            model_name="taggedcontentpage",
            name="hero_image_description",
            field=models.TextField(
                blank=True,
                default="",
                help_text="Caption shown under the hero image on the article page.",
                max_length=500,
            ),
        ),
        migrations.AlterField(
            model_name="taggedcontentpage",
            name="lede",
            field=wagtailmarkdown.fields.MarkdownField(
                blank=True,
                help_text="Opening paragraph under the headline on the article page and on listing tiles.",
                verbose_name="Lede",
            ),
        ),
    ]
