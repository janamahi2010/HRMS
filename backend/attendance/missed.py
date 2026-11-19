"""Forgotten check-outs: reminders, the "fix it" nudge and the manager view."""

from datetime import date, timedelta

from django.utils import timezone

from company.services import get_settings
from core.constants import RequestStatus

from .models import Attendance
from .services import IST, combine_ist, today_ist

REMIND_AFTER = timedelta(minutes=30)  # after the shift ends
LOOKBACK_DAYS = 30  # regularization limit


def _fixed_dates(user_ids, start: date, end: date) -> set[tuple[int, date]]:
    """(user, date) pairs that already have a pending/approved request, i.e. being fixed."""
    from requests_app.models import RegularizationRequest

    return set(
        RegularizationRequest.objects.filter(
            user_id__in=user_ids, date__range=(start, end), status__in=[RequestStatus.PENDING, RequestStatus.APPROVED]
        ).values_list("user_id", "date")
    )


def unresolved(user, today: date | None = None, days: int = LOOKBACK_DAYS) -> list[Attendance]:
    """Past days (newest first) where they checked in, never checked out, and haven't asked to fix it yet."""
    today = today or today_ist()
    start = today - timedelta(days=days)
    rows = list(
        Attendance.objects.filter(
            user=user, date__gte=start, date__lt=today, check_in_at__isnull=False, check_out_at__isnull=True
        ).order_by("-date")
    )
    if not rows:
        return []
    fixed = _fixed_dates([user.id], start, today)
    return [r for r in rows if (r.user_id, r.date) not in fixed]


def reminder_due(user, now=None) -> Attendance | None:
    """Today's row if they're still checked in 30 minutes after the shift ended."""
    now = now or timezone.now()
    today = now.astimezone(IST).date()
    row = Attendance.objects.filter(user=user, date=today, check_in_at__isnull=False, check_out_at__isnull=True).first()
    if not row:
        return None
    cfg = get_settings(user.company_id)
    return row if now >= combine_ist(today, cfg.office_end) + REMIND_AFTER else None


def team_forgot(user_ids, today: date | None = None, days: int = 7) -> list[dict]:
    """Per person over the last `days` (not today): how many days they forgot, and how many are still unfixed."""
    from requests_app.models import RegularizationRequest

    today = today or today_ist()
    start = today - timedelta(days=days)
    open_rows = Attendance.objects.filter(
        user_id__in=user_ids, date__gte=start, date__lt=today, check_in_at__isnull=False, check_out_at__isnull=True
    ).values_list("user_id", "date")
    # Forgot but already fixed with a missed-punch request (the row now has a check-out).
    fixed_reqs = RegularizationRequest.objects.filter(
        user_id__in=user_ids, date__gte=start, date__lt=today, type="missed_punch",
        status__in=[RequestStatus.PENDING, RequestStatus.APPROVED],
    ).values_list("user_id", "date")
    fixed = set(fixed_reqs)
    forgot: dict[int, set[date]] = {}
    unfixed: dict[int, int] = {}
    for uid, d in open_rows:
        forgot.setdefault(uid, set()).add(d)
        if (uid, d) not in fixed:
            unfixed[uid] = unfixed.get(uid, 0) + 1
    for uid, d in fixed:
        forgot.setdefault(uid, set()).add(d)
    if not forgot:
        return []
    from accounts.models import User

    people = {u.id: u for u in User.objects.filter(id__in=forgot.keys())}
    out = [
        {
            "user": {"id": uid, "name": people[uid].name, "designation": people[uid].designation},
            "count": len(ds),
            "unfixed": unfixed.get(uid, 0),
            "last_date": max(ds),
        }
        for uid, ds in forgot.items()
        if uid in people
    ]
    out.sort(key=lambda r: (-r["count"], -r["unfixed"], r["user"]["name"]))
    return out
