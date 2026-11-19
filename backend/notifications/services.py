"""Create in-app notifications. Safe inside a transaction (rows roll back with the work that caused them)."""

from collections.abc import Iterable
from datetime import timedelta

from django.utils import timezone

from .models import Notification

Kind = Notification.Kind
KEEP_DAYS = 90


def notify(recipients: Iterable, kind: str, title: str, *, body: str = "", link: str = "", actor=None, dedupe_key: str = "") -> int:
    """One notification per distinct, active recipient (never the person who caused it)."""
    seen, rows = set(), []
    for u in recipients:
        if u is None or not u.is_active or u.id in seen or (actor is not None and u.id == actor.id):
            continue
        seen.add(u.id)
        rows.append(
            Notification(
                company_id=u.company_id,
                recipient=u,
                actor=actor,
                kind=kind,
                title=title[:200],
                body=(body or "")[:300],
                link=link[:200],
                dedupe_key=dedupe_key,
            )
        )
    Notification.objects.bulk_create(rows, ignore_conflicts=bool(dedupe_key))
    return len(rows)


def checkout_reminder(user, now=None) -> int:
    """'You haven't checked out yet' once a day, 30 min after the shift ends (cron + lazily on poll)."""
    from attendance.missed import reminder_due
    from company.services import get_settings

    row = reminder_due(user, now)
    if not row:
        return 0
    end = get_settings(user.company_id).office_end
    return notify(
        [user],
        Kind.CHECKOUT_REMINDER,
        "You haven't checked out yet",
        body=f"Your shift ended at {end.strftime('%I:%M %p').lstrip('0')}. Check out before you leave so today counts in full.",
        link="/",
        dedupe_key=f"checkout:{row.date}",
    )


def missed_checkout_nudge(user) -> int:
    """'You forgot to check out on …' for the most recent unfixed day (once per day missed)."""
    from attendance.missed import unresolved

    rows = unresolved(user, days=7)
    if not rows:
        return 0
    d = rows[0].date
    more = len(rows) - 1
    return notify(
        [user],
        Kind.MISSED_CHECKOUT,
        f"You forgot to check out on {d:%a, %d %b}",
        body="Tap to send a missed-punch request so the day isn't counted as incomplete."
        + (f" ({more} more day{'s' if more > 1 else ''} to fix)" if more else ""),
        link=f"/requests?new=1&date={d.isoformat()}",
        dedupe_key=f"missed:{d}",
    )


def ensure_daily(user) -> None:
    """Generated notifications that have no event of their own: birthdays, check-out reminders. Idempotent."""
    checkout_reminder(user)
    missed_checkout_nudge(user)
    from accounts.celebrations import _celebrants, birthday_in_year
    from attendance.services import today_ist

    today = today_ist()
    for p in _celebrants(user.company_id):
        if birthday_in_year(p.date_of_birth, today.year) != today:
            continue
        if p.id == user.id:
            notify(
                [user],
                Kind.BIRTHDAY_SELF,
                f"Happy birthday, {user.name.split(' ')[0]}! 🎂",
                body=f"Wishing you a wonderful year from everyone at {user.company.name}.",
                link="/",
                dedupe_key=f"bday-self:{today}",
            )
        else:
            notify(
                [user],
                Kind.BIRTHDAY,
                f"It's {p.name}'s birthday today 🎂",
                body="Send them your wishes from the Home page.",
                link="/",
                actor=None,
                dedupe_key=f"bday:{p.id}:{today}",
            )


def prune(user) -> None:
    Notification.objects.filter(recipient=user, created_at__lt=timezone.now() - timedelta(days=KEEP_DAYS)).delete()
