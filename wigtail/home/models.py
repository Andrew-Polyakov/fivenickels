from django.db import models
from django.shortcuts import get_object_or_404
from modelcluster.fields import ParentalManyToManyField
from wagtail.admin.panels import FieldPanel, MultiFieldPanel
from wagtail.contrib.routable_page.models import RoutablePageMixin, route
from wagtail.fields import StreamField
from wagtail.images import get_image_model_string
from wagtail.models import Page
from wagtail.snippets.models import register_snippet
from wagtailmarkdown.fields import MarkdownField

from home.blocks import MAIN_SITE_STREAMBLOCK
from home.gics_sectors import GICS_SECTOR_ORDER, GICS_SECTOR_SLUGS


@register_snippet
class TaxonomyTerm(models.Model):
    """Reusable label for grouping or tagging markdown tiles (slug for future URLs or filters)."""

    name = models.CharField(max_length=255)
    slug = models.SlugField(max_length=255, unique=True)

    panels = [
        FieldPanel("name"),
        FieldPanel("slug"),
    ]

    class Meta:
        ordering = ["name"]
        verbose_name = "taxonomy term"
        verbose_name_plural = "taxonomy terms"

    def __str__(self) -> str:
        return self.name


@register_snippet
class ContentTag(models.Model):
    name = models.CharField(max_length=255)
    slug = models.SlugField(max_length=255, unique=True)

    panels = [
        FieldPanel("name"),
        FieldPanel("slug"),
    ]

    class Meta:
        ordering = ["name"]
        verbose_name = "content tag"
        verbose_name_plural = "content tags"

    def __str__(self) -> str:
        return self.name


class SubsectionIndexPage(Page):
    section_term = models.ForeignKey(
        TaxonomyTerm,
        on_delete=models.PROTECT,
        related_name="+",
    )
    intro = StreamField(
        MAIN_SITE_STREAMBLOCK,
        blank=True,
        use_json_field=True,
    )
    recent_tile_limit = models.PositiveSmallIntegerField(default=12)

    content_panels = Page.content_panels + [
        FieldPanel("section_term"),
        FieldPanel("recent_tile_limit"),
        FieldPanel("intro"),
    ]

    def get_context(self, request, *args, **kwargs):
        from home.query import get_recent_pages_for_section

        context = super().get_context(request, *args, **kwargs)
        context["recent_pages"] = get_recent_pages_for_section(
            self.section_term,
            limit=self.recent_tile_limit,
        )
        return context


class TaggedContentPage(Page):
    section_term = models.ForeignKey(
        TaxonomyTerm,
        on_delete=models.PROTECT,
        related_name="+",
    )
    tags = ParentalManyToManyField(ContentTag, blank=True)
    hero_image = models.ForeignKey(
        get_image_model_string(),
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )
    tile_preview = MarkdownField(blank=True)
    body = StreamField(
        MAIN_SITE_STREAMBLOCK,
        blank=True,
        use_json_field=True,
    )

    content_panels = Page.content_panels + [
        MultiFieldPanel(
            [
                FieldPanel("section_term"),
                FieldPanel("tags"),
                FieldPanel("hero_image"),
                FieldPanel("tile_preview"),
            ],
            heading="Listing & taxonomy",
        ),
        FieldPanel("body"),
    ]

    def get_context(self, request, *args, **kwargs):
        from home.query import get_similar_pages

        context = super().get_context(request, *args, **kwargs)
        context["similar_pages"] = get_similar_pages(self, limit=24)
        context["routable_home"] = HomePage.objects.live().public().first()
        return context


class HomePage(RoutablePageMixin, Page):
    body = StreamField(
        MAIN_SITE_STREAMBLOCK,
        blank=True,
        use_json_field=True,
    )

    content_panels = Page.content_panels + [
        FieldPanel("body"),
    ]

    @route(r"^tags/(?P<tag_slug>[-\w]+)/$", name="tag_archive")
    def tag_archive(self, request, tag_slug):
        tag = get_object_or_404(ContentTag, slug=tag_slug)
        qs = (
            TaggedContentPage.objects.live()
            .public()
            .filter(tags=tag)
            .order_by("-first_published_at")
        )
        section = (request.GET.get("section") or "").strip()
        if section:
            qs = qs.filter(section_term__slug=section)
        return self.render(
            request,
            template="home/tag_archive.html",
            context_overrides={
                "archive_tag": tag,
                "archive_pages": list(qs),
                "archive_section_filter": section or None,
            },
        )

    def get_context(self, request, *args, **kwargs):
        from home.query import taxonomy_term_shown_in_sector_nav

        context = super().get_context(request, *args, **kwargs)
        terms = list(TaxonomyTerm.objects.filter(slug__in=GICS_SECTOR_SLUGS))
        terms.sort(key=lambda t: GICS_SECTOR_ORDER[t.slug])
        nav = []
        for t in terms:
            if not taxonomy_term_shown_in_sector_nav(self, t):
                continue
            index = (
                SubsectionIndexPage.objects.live()
                .public()
                .filter(section_term=t)
                .first()
            )
            nav.append(
                {
                    "term": t,
                    "subsection_url": index.url if index else None,
                }
            )
        context["sector_nav"] = nav
        raw = (request.GET.get("sector") or "").strip()
        context["sector_nav_active"] = raw if raw in GICS_SECTOR_SLUGS else None
        return context
