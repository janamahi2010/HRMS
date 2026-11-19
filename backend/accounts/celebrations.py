"""Birthday celebrations on the Home page.

Privacy: only day + month are exposed, never the birth year, and anyone can opt out with
`show_birthday=False` (they then don't appear and can't be wished).
"""

from datetime import date, timedelta

from django.db import IntegrityError, transaction

from attendance.services import today_ist
from core.exceptions import ServiceError

from .models import BirthdayWish, User

MAX_UPCOMING_DAYS = 60


def birthday_in_year(dob: date, year: int) -> date:
    """The celebration date in `year` (29 Feb falls back to 28 Feb in non-leap years)."""
    try:
        return dob.replace(year=year)
    except ValueError:
        return date(year, 2, 28)


def next_birthday(dob: date, today: date) -> date:
    d = birthday_in_year(dob, today.year)
    return d if d >= today else birthday_in_year(dob, today.year + 1)


def _celebrants(company_id: int):
    return User.objects.filter(
        company_id=company_id, is_active=True, show_birthday=True, date_of_birth__isnull=False
    ).only("id", "name", "designation", "date_of_birth")


def _person(u: User) -> dict:
    return {"id": u.id, "name": u.name, "designation": u.designation}


def poster_url(company, request=None) -> str | None:
    if not company or not company.birthday_poster:
        return None
    url = company.birthday_poster.url
    return request.build_absolute_uri(url) if request and not url.startswith("http") else url


def celebrations(viewer: User, days: int = 14, request=None) -> dict:
    today = today_ist()
    days = max(1, min(days, MAX_UPCOMING_DAYS))
    people = list(_celebrants(viewer.company_id))
    todays = [u for u in people if birthday_in_year(u.date_of_birth, today.year) == today]

    wishes = {}
    if todays:
        for w in BirthdayWish.objects.filter(to_user__in=todays, year=today.year).select_related("from_user"):
            wishes.setdefault(w.to_user_id, []).append(w)

    today_items = []
    for u in sorted(todays, key=lambda x: (x.id != viewer.id, x.name)):  # "me" first
        ws = wishes.get(u.id, [])
        item = {
            "user": _person(u),
            "is_me": u.id == viewer.id,
            "wishes_count": len(ws),
            "wished_by_me": any(w.from_user_id == viewer.id for w in ws),
        }
        if u.id == viewer.id:
            # Only the birthday person sees who wished them and what they wrote.
            item["wishes"] = [
                {"id": w.id, "from": _person(w.from_user), "message": w.message, "created_at": w.created_at} for w in ws
            ]
        today_items.append(item)

    upcoming = []
    horizon = today + timedelta(days=days)
    for u in people:
        nxt = next_birthday(u.date_of_birth, today + timedelta(days=1))
        if nxt <= horizon:
            upcoming.append({"user": _person(u), "date": nxt, "days_until": (nxt - today).days})
    upcoming.sort(key=lambda x: (x["date"], x["user"]["name"]))

    me = next((u for u in people if u.id == viewer.id), None)
    return {
        "date": today,
        "today": today_items,
        "upcoming": upcoming,
        "poster_url": poster_url(viewer.company, request),
        # Lets the UI nudge people who haven't added their birthday yet.
        "my_birthday_set": User.objects.filter(pk=viewer.pk, date_of_birth__isnull=False).exists(),
        "my_birthday_visible": me is not None,
    }


@transaction.atomic
def send_wish(viewer: User, to_user_id: int, message: str = "") -> BirthdayWish:
    today = today_ist()
    to = _celebrants(viewer.company_id).filter(pk=to_user_id).first()
    if to is None or birthday_in_year(to.date_of_birth, today.year) != today:
        raise ServiceError("It isn't this person's birthday today.", code="not_birthday", status_code=404)
    if to.id == viewer.id:
        raise ServiceError("You can't wish yourself, but happy birthday!", code="self_wish")
    message = (message or "").strip()[:200]
    try:
        with transaction.atomic():
            wish, created = BirthdayWish.objects.get_or_create(
                to_user=to, from_user=viewer, year=today.year, defaults={"company_id": viewer.company_id, "message": message}
            )
    except IntegrityError:  # double-click race: the other request created it
        wish, created = BirthdayWish.objects.get(to_user=to, from_user=viewer, year=today.year), False
    if created:
        from notifications.services import notify

        notify(
            [to],
            "birthday_wish",
            f"{viewer.name} wished you a happy birthday 🎉",
            body=message,
            link="/",
            actor=viewer,
            dedupe_key=f"wish:{viewer.id}:{today.year}",
        )
    if not created and message and wish.message != message:
        wish.message = message
        wish.save(update_fields=["message", "updated_at"])
    return wish
