"""Tell everyone about a new post by email (optional, chosen by the admin when posting)."""

from django.conf import settings

from core.email import send_bulk_async

from .models import NewsPost


def _abs(url: str) -> str:
    return url if url.startswith("http") else f"{settings.BACKEND_URL.rstrip('/')}{url}"


def email_everyone(post: NewsPost) -> int:
    from accounts.models import User

    people = User.objects.filter(company_id=post.company_id, is_active=True).exclude(pk=post.author_id).values_list("email", "name")
    recipients = [(email, (name or "").split(" ")[0] or "there") for email, name in people]
    first = post.images.first()
    body = post.body if len(post.body) <= 600 else post.body[:600].rsplit(" ", 1)[0] + "…"
    intro = f"{post.author.name if post.author else 'Your admin'} shared a new {post.get_category_display().lower()} update"
    if post.event_date:
        intro += f" ({post.event_date:%d %b %Y})"
    send_bulk_async(
        f"{post.company.name} news: {post.title}",
        "emails/notification.html",
        {
            "company": post.company,
            "badge": post.get_category_display(),
            "heading": post.title,
            "intro": intro + ".",
            "image_url": _abs(first.image.url) if first else None,
            "quote": body,
            "quote_label": "Details",
            "link": f"{settings.FRONTEND_URL.rstrip('/')}/news#post-{post.id}",
            "cta": "Read the full post",
        },
        recipients,
    )
    return len(recipients)
