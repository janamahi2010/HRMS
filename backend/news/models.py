"""Company news feed: admins post news, MoUs, events and announcements (with photos) for everyone."""

from django.db import models

from core.models import TimeStampedModel


class NewsPost(TimeStampedModel):
    class Category(models.TextChoices):
        NEWS = "news", "News"
        ANNOUNCEMENT = "announcement", "Announcement"
        EVENT = "event", "Event / program"
        MOU = "mou", "MoU / partnership"
        ACHIEVEMENT = "achievement", "Achievement"

    company = models.ForeignKey("company.Company", on_delete=models.CASCADE, related_name="news_posts")
    author = models.ForeignKey("accounts.User", on_delete=models.SET_NULL, null=True, blank=True, related_name="news_posts")
    title = models.CharField(max_length=150)
    body = models.TextField(blank=True)
    category = models.CharField(max_length=20, choices=Category.choices, default=Category.NEWS)
    # When the event / signing happened (optional; the post date is created_at).
    event_date = models.DateField(null=True, blank=True)
    is_pinned = models.BooleanField(default=False)

    class Meta:
        ordering = ["-is_pinned", "-created_at", "-id"]
        indexes = [models.Index(fields=["company", "-is_pinned", "-created_at"], name="news_company_feed_idx")]

    def __str__(self) -> str:
        return self.title


class NewsImage(TimeStampedModel):
    post = models.ForeignKey(NewsPost, on_delete=models.CASCADE, related_name="images")
    image = models.ImageField(upload_to="news/%Y/%m/")
    width = models.PositiveIntegerField(default=0)
    height = models.PositiveIntegerField(default=0)
    position = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["position", "id"]
