"""Fire-and-forget HTML email.

Emails are queued with transaction.on_commit (so nothing is sent for rolled-back
work) and delivered from a daemon thread so the request never waits on SMTP.
Failures are logged and never propagate to the caller.
"""

import logging
import threading
from collections.abc import Iterable

from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.db import transaction
from django.template.loader import render_to_string
from django.utils.html import strip_tags

logger = logging.getLogger("hrms.email")


def _deliver(subject: str, to: list[str], html: str, cc: list[str]) -> None:
    try:
        msg = EmailMultiAlternatives(
            subject=subject,
            body=strip_tags(html),
            from_email=settings.DEFAULT_FROM_EMAIL,
            to=to,
            cc=cc,
        )
        msg.attach_alternative(html, "text/html")
        msg.send(fail_silently=False)
        logger.info("Email sent: %r to %s (cc %s)", subject, to, cc)
    except Exception:  # noqa: BLE001 - never let email break anything
        logger.exception("Email failed: %r to %s", subject, to)


def _logo_url(company) -> str | None:
    """Absolute logo URL (mail clients can't resolve relative /media/ paths)."""
    logo = getattr(company, "logo", None)
    if not logo:
        return None
    try:
        url = logo.url
    except ValueError:
        return None
    return url if url.startswith("http") else f"{settings.BACKEND_URL.rstrip('/')}{url}"


def send_email_async(
    subject: str,
    template: str,
    context: dict,
    to: Iterable[str],
    cc: Iterable[str] = (),
) -> None:
    to_list = sorted({e for e in to if e})
    cc_list = sorted({e for e in cc if e} - set(to_list))
    if not to_list:
        return
    ctx = {"frontend_url": settings.FRONTEND_URL, "logo_url": _logo_url(context.get("company")), **context}
    try:
        html = render_to_string(template, ctx)
    except Exception:  # noqa: BLE001
        logger.exception("Email template render failed: %s", template)
        return

    def _start():
        if getattr(settings, "EMAIL_ASYNC", True):
            threading.Thread(target=_deliver, args=(subject, to_list, html, cc_list), daemon=True).start()
        else:  # tests: deliver inline so mail.outbox is deterministic
            _deliver(subject, to_list, html, cc_list)

    transaction.on_commit(_start)


def send_bulk_async(subject: str, template: str, context: dict, recipients: Iterable[tuple[str, str]]) -> None:
    """One personalised email per (email, first_name), all delivered from a single background thread."""
    base = {"frontend_url": settings.FRONTEND_URL, "logo_url": _logo_url(context.get("company")), **context}
    jobs = []
    for email, name in recipients:
        if not email:
            continue
        try:
            jobs.append((email, render_to_string(template, {**base, "recipient_name": name})))
        except Exception:  # noqa: BLE001
            logger.exception("Email template render failed: %s", template)
            return
    if not jobs:
        return

    def _run():
        for email, html in jobs:
            _deliver(subject, [email], html, [])

    def _start():
        if getattr(settings, "EMAIL_ASYNC", True):
            threading.Thread(target=_run, daemon=True).start()
        else:
            _run()

    transaction.on_commit(_start)
