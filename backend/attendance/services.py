"""Attendance business logic: punching, the day view, the month calendar and closing a day.

Rules that matter (all enforced here, never trusted from the client):
- Time is always server time (timezone.now()); the client only sends a GPS fix.
- A punch must come from within the assigned office's radius (Haversine) with a fix
  accurate to MAX_ACCURACY_M or better.
- No punching on holidays, weekly offs or approved full-day leave; one check-in and
  one check-out per day. Concurrent punches are serialised with select_for_update.
- Holidays and weekly offs are never stored; they're derived from WorkCalendar.
"""

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from decimal import ROUND_HALF_UP, Decimal
from zoneinfo import ZoneInfo

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from company.models import CompanySettings, OfficeLocation
from company.services import WorkCalendar, get_settings
from core.constants import RequestStatus
from core.exceptions import ServiceError
from core.geo import haversine_m

from .models import Attendance, AttendanceSource, AttendanceStatus

IST = ZoneInfo(settings.TIME_ZONE)
MAX_ACCURACY_M = 150
SUMMARY_MAX_CHARS = 2000
SUMMARY_MIN_CHARS = 10  # when required: enough for one real sentence, blocks "ok" / "work"
SUMMARY_EDIT_UNTIL = time(12, 0)  # yesterday's note stays editable until noon today (forgot at night)


# --------------------------------------------------------------------------- helpers


def local(dt: datetime) -> datetime:
    return dt.astimezone(IST)


def today_ist() -> date:
    return timezone.now().astimezone(IST).date()


def is_late(check_in_at: datetime, cfg: CompanySettings) -> bool:
    return local(check_in_at).time().replace(second=0, microsecond=0) > cfg.late_after


def worked_minutes(check_in_at: datetime | None, check_out_at: datetime | None) -> int:
    if not check_in_at or not check_out_at or check_out_at <= check_in_at:
        return 0
    return int((check_out_at - check_in_at).total_seconds() // 60)


def derive_status(*, late: bool, minutes: int, checked_out: bool, cfg: CompanySettings, half_day_leave: bool = False) -> str:
    """Status for a day the user actually punched.

    - Before check-out: Present / Late (provisional).
    - After check-out: worked < half_day threshold -> Half-day (unless the other half is
      approved half-day leave, in which case the expected hours are halved), else Late / Present.
    """
    if checked_out:
        required = cfg.half_day_minutes // 2 if half_day_leave else cfg.half_day_minutes
        if minutes < required:
            return AttendanceStatus.HALF_DAY
    return AttendanceStatus.LATE if late else AttendanceStatus.PRESENT


def combine_ist(d, t: time) -> datetime:
    """Build an aware datetime for an IST wall-clock date + time."""
    return datetime.combine(d, t, tzinfo=IST)


def client_ip(request) -> str | None:
    """Render (and most PaaS) sit behind a proxy: the client is the first X-Forwarded-For hop."""
    fwd = request.META.get("HTTP_X_FORWARDED_FOR", "")
    ip = fwd.split(",")[0].strip() if fwd else request.META.get("REMOTE_ADDR")
    return ip or None


def _dec6(v: float) -> Decimal:
    return Decimal(str(v)).quantize(Decimal("0.000001"), rounding=ROUND_HALF_UP)


def approved_leaves(user_id: int, start: date, end: date) -> dict[date, "LeaveRequest"]:  # noqa: F821
    """Approved leave per calendar day for one user (one query)."""
    from leaves.models import LeaveRequest

    out: dict[date, LeaveRequest] = {}
    qs = LeaveRequest.objects.filter(
        user_id=user_id, status=RequestStatus.APPROVED, from_date__lte=end, to_date__gte=start
    ).select_related("leave_type")
    for lr in qs:
        d = max(lr.from_date, start)
        while d <= min(lr.to_date, end):
            out[d] = lr
            d += timedelta(days=1)
    return out


# --------------------------------------------------------------------------- punching


@dataclass
class Fix:
    lat: float | None
    lng: float | None
    accuracy: float
    ip: str | None = None
    user_agent: str = ""


def _check_fix(office: OfficeLocation, fix: Fix) -> float:
    """Validate accuracy + radius; return the distance in metres."""
    if fix.accuracy > MAX_ACCURACY_M:
        raise ServiceError(
            f"Your location is too imprecise (±{round(fix.accuracy)} m). Move to an open area or turn on precise location and try again.",
            code="low_accuracy",
            extra={"accuracy_m": round(fix.accuracy), "max_accuracy_m": MAX_ACCURACY_M},
        )
    distance = haversine_m(fix.lat, fix.lng, float(office.latitude), float(office.longitude))
    if distance > office.radius_m:
        raise ServiceError(
            f"You're {_fmt_m(distance)} from {office.name}. You need to be within {office.radius_m} m to punch.",
            code="outside_radius",
            extra={"distance_m": round(distance), "radius_m": office.radius_m, "office": office.name},
        )
    return distance


def _locate(user, office: OfficeLocation | None, fix: Fix) -> tuple[OfficeLocation | None, float | None, str]:
    """Where is this punch from? Returns (office, distance, source).

    Office-based people must be inside the radius (as before). People allowed to work remotely are never
    blocked: at the office it's a normal punch, anywhere else it's recorded as Remote."""
    if not user.remote_allowed:
        if fix.lat is None:
            raise ServiceError("Turn on location to check in.", code="location_required")
        return office, _check_fix(office, fix), AttendanceSource.GPS
    distance = None
    active = office if office is not None and office.is_active else None
    if active is not None and fix.lat is not None:
        distance = haversine_m(fix.lat, fix.lng, float(active.latitude), float(active.longitude))
        if distance <= active.radius_m and fix.accuracy <= MAX_ACCURACY_M:
            return active, distance, AttendanceSource.GPS
    return active, distance, AttendanceSource.REMOTE


def _fmt_m(m: float) -> str:
    return f"{m / 1000:.1f} km" if m >= 1000 else f"{round(m)} m"


def _office_or_error(user) -> OfficeLocation:
    office = user.office_location
    if office is None:
        raise ServiceError(
            "You don't have an office location assigned yet. Ask your admin to assign one.", code="no_office"
        )
    if not office.is_active:
        raise ServiceError(f"{office.name} is inactive, so check-ins are disabled. Contact your admin.", code="office_inactive")
    return office


def _block_non_working_day(user, d: date, cfg: CompanySettings):
    """Raise if the user may not punch today. Returns the approved half-day leave, if any."""
    cal = WorkCalendar(user.company_id, d, d, cfg)
    kind = cal.day_kind(d)
    if kind == "holiday":
        raise ServiceError(f"Today is a holiday ({cal.holidays[d]}). Enjoy your day off!", code="holiday")
    if kind == "weekly_off":
        raise ServiceError("Today is your weekly off.", code="weekly_off")
    leave = approved_leaves(user.id, d, d).get(d)
    if leave and not leave.is_half_day:
        raise ServiceError(f"You're on approved {leave.leave_type.name.lower()} today.", code="on_leave")
    return leave


def _lock_user(user):
    """Serialise punches per user so double-taps / two tabs can't create two rows."""
    from accounts.models import User

    return User.objects.select_for_update(of=("self",)).select_related("office_location").get(pk=user.pk)


@transaction.atomic
def check_in(user, fix: Fix) -> Attendance:
    user = _lock_user(user)
    now = timezone.now()
    d = local(now).date()
    cfg = get_settings(user.company_id)

    office = user.office_location if user.remote_allowed else _office_or_error(user)
    leave = _block_non_working_day(user, d, cfg)

    existing = Attendance.objects.select_for_update().filter(user=user, date=d).first()
    if existing and existing.check_in_at:
        raise ServiceError(
            f"You already checked in today at {local(existing.check_in_at):%I:%M %p}.",
            code="already_checked_in",
            status_code=409,
        )
    if existing:
        raise ServiceError("Today's attendance is already recorded.", code="already_recorded", status_code=409)

    office, distance, source = _locate(user, office, fix)

    # Arriving for the second half after a first-half leave isn't "late".
    late = is_late(now, cfg) and not (leave and leave.half == "first")
    return Attendance.objects.create(
        company_id=user.company_id,
        user=user,
        date=d,
        status=derive_status(late=late, minutes=0, checked_out=False, cfg=cfg),
        source=source,
        check_in_at=now,
        check_in_lat=_dec6(fix.lat) if fix.lat is not None else None,
        check_in_lng=_dec6(fix.lng) if fix.lng is not None else None,
        check_in_accuracy_m=round(fix.accuracy, 1) if fix.lat is not None else None,
        check_in_distance_m=round(distance, 1) if distance is not None else None,
        check_in_ip=fix.ip,
        check_in_user_agent=(fix.user_agent or "")[:255],
        office_location=office,
        is_late=late,
        remarks=f"Half-day leave ({leave.half} half)" if leave else "",
    )


@transaction.atomic
def check_out(user, fix: Fix) -> Attendance:
    user = _lock_user(user)
    now = timezone.now()
    d = local(now).date()
    cfg = get_settings(user.company_id)

    row = Attendance.objects.select_for_update().filter(user=user, date=d).first()
    if not row or not row.check_in_at:
        raise ServiceError("You haven't checked in today.", code="not_checked_in")
    if row.check_out_at:
        raise ServiceError(
            f"You already checked out today at {local(row.check_out_at):%I:%M %p}.",
            code="already_checked_out",
            status_code=409,
        )

    if cfg.work_summary_required and len(row.work_summary.strip()) < SUMMARY_MIN_CHARS:
        raise ServiceError(
            "Add a short summary of today's work before checking out.",
            code="work_summary_required",
            extra={"field": "summary", "min_chars": SUMMARY_MIN_CHARS},
        )

    office = user.office_location if user.remote_allowed else _office_or_error(user)
    office, distance, source = _locate(user, office, fix)
    if source == AttendanceSource.REMOTE:
        row.source = AttendanceSource.REMOTE  # left from outside the office

    half_day_leave = bool(approved_leaves(user.id, d, d).get(d))
    row.check_out_at = now
    row.check_out_lat = _dec6(fix.lat) if fix.lat is not None else None
    row.check_out_lng = _dec6(fix.lng) if fix.lng is not None else None
    row.check_out_accuracy_m = round(fix.accuracy, 1) if fix.lat is not None else None
    row.check_out_distance_m = round(distance, 1) if distance is not None else None
    row.check_out_ip = fix.ip
    row.check_out_user_agent = (fix.user_agent or "")[:255]
    row.worked_minutes = worked_minutes(row.check_in_at, now)
    row.status = derive_status(
        late=row.is_late, minutes=row.worked_minutes, checked_out=True, cfg=cfg, half_day_leave=half_day_leave
    )
    row.save()
    return row


# --------------------------------------------------------------------------- read models


def today_state(user) -> dict:
    """Everything the check-in card needs in one payload."""
    now = timezone.now()
    d = local(now).date()
    cfg = get_settings(user.company_id)
    cal = WorkCalendar(user.company_id, d, d, cfg)
    kind = cal.day_kind(d)
    leave = approved_leaves(user.id, d, d).get(d)
    row = Attendance.objects.filter(user=user, date=d).first()
    office = user.office_location

    blocked = None
    if kind == "holiday":
        blocked = {"code": "holiday", "message": f"Today is a holiday: {cal.holidays[d]}."}
    elif kind == "weekly_off":
        blocked = {"code": "weekly_off", "message": "Today is your weekly off."}
    elif leave and not leave.is_half_day:
        blocked = {"code": "on_leave", "message": f"You're on approved {leave.leave_type.name.lower()} today."}
    elif office is None and not user.remote_allowed:
        blocked = {"code": "no_office", "message": "No office location is assigned to you yet. Ask your admin."}
    elif office is not None and not office.is_active and not user.remote_allowed:
        blocked = {"code": "office_inactive", "message": f"{office.name} is inactive, so check-ins are disabled."}
    elif row and not row.check_in_at:
        blocked = {"code": "already_recorded", "message": f"Today is marked {row.get_status_display().lower()}."}

    checked_in = bool(row and row.check_in_at)
    checked_out = bool(row and row.check_out_at)
    return {
        "date": d,
        "server_time": now,
        "day_kind": kind,
        "holiday_name": cal.holidays.get(d),
        "leave": _leave_payload(leave),
        "office": _office_payload(office),
        "timings": {
            "office_start": cfg.office_start.strftime("%H:%M"),
            "office_end": cfg.office_end.strftime("%H:%M"),
            "late_after": cfg.late_after.strftime("%H:%M"),
            "half_day_hours": float(cfg.half_day_hours),
        },
        "record": serialize_record(row) if row else None,
        "can_check_in": blocked is None and not checked_in,
        "can_check_out": checked_in and not checked_out and (user.remote_allowed or (office is not None and office.is_active)),
        "remote_allowed": user.remote_allowed,
        "blocked": None if checked_in else blocked,
        "max_accuracy_m": MAX_ACCURACY_M,
        "work_summary_required": cfg.work_summary_required,
        "work_summary_min_chars": SUMMARY_MIN_CHARS,
    }


def _office_payload(office: OfficeLocation | None):
    if office is None:
        return None
    return {
        "id": office.id,
        "name": office.name,
        "address": office.address,
        "latitude": float(office.latitude),
        "longitude": float(office.longitude),
        "radius_m": office.radius_m,
        "is_active": office.is_active,
    }


def _leave_payload(leave):
    if leave is None:
        return None
    return {
        "id": leave.id,
        "type": leave.leave_type.name,
        "color": leave.leave_type.color,
        "is_half_day": leave.is_half_day,
        "half": leave.half or None,
    }


def serialize_record(row: Attendance) -> dict:
    return {
        "id": row.id,
        "date": row.date,
        "status": row.status,
        "source": row.source,
        "check_in_at": row.check_in_at,
        "check_out_at": row.check_out_at,
        "check_in_distance_m": row.check_in_distance_m,
        "check_out_distance_m": row.check_out_distance_m,
        "check_in_accuracy_m": row.check_in_accuracy_m,
        "worked_minutes": row.worked_minutes,
        "is_late": row.is_late,
        "office": row.office_location.name if row.office_location_id and row.office_location else None,
        "remarks": row.remarks,
        "work_summary": row.work_summary,
        "work_summary_updated_at": row.work_summary_updated_at,
        "summary_editable": summary_editable(row.date, row),
        "summary_editable_until": summary_editable_until(row.date, row),
    }


# --------------------------------------------------------------------------- daily work summary


REGULARIZED_NOTE_GRACE = timedelta(hours=48)


def summary_editable_until(d: date, row: Attendance | None = None) -> datetime:
    """A day's note can be written until noon the next day.

    Days that only became workdays through an approved regularization (WFH, client visit,
    missed punch) are often approved days later, so they also get 48 h from the approval.
    """
    until = combine_ist(d + timedelta(days=1), SUMMARY_EDIT_UNTIL)
    if row is not None and row.source == AttendanceSource.REGULARIZATION and until < timezone.now():
        from requests_app.models import RegularizationRequest

        decided = (
            RegularizationRequest.objects.filter(user_id=row.user_id, date=d, status=RequestStatus.APPROVED)
            .order_by("-decided_at")
            .values_list("decided_at", flat=True)
            .first()
        )
        if decided:
            until = max(until, decided + REGULARIZED_NOTE_GRACE)
    return until


def summary_editable(d: date, row: Attendance | None = None) -> bool:
    return timezone.now() < summary_editable_until(d, row)


@transaction.atomic
def save_work_summary(user, d: date, text: str) -> Attendance:
    """Write the employee's own note for a day they worked (office punch, WFH or client visit)."""
    text = (text or "").strip()
    if len(text) > SUMMARY_MAX_CHARS:
        raise ServiceError(f"Keep it under {SUMMARY_MAX_CHARS} characters.", code="too_long", extra={"field": "summary"})
    row = Attendance.objects.select_for_update().filter(user=user, date=d).first()
    if row is not None and row.check_in_at and not summary_editable(d, row):
        raise ServiceError(
            "Work notes can be edited until noon the next day (or 48 hours after a regularization is approved).",
            code="summary_locked",
            extra={"field": "summary"},
        )
    if row is None or not row.check_in_at:
        raise ServiceError(
            "There's no attendance for this day yet. Check in first, or request a regularization.",
            code="no_attendance",
            extra={"field": "summary"},
        )
    cfg = get_settings(user.company_id)
    if not text and cfg.work_summary_required and row.check_out_at:
        raise ServiceError("A work summary is required and can't be cleared.", code="work_summary_required", extra={"field": "summary"})
    row.work_summary = text
    row.work_summary_updated_at = timezone.now()
    row.save(update_fields=["work_summary", "work_summary_updated_at", "updated_at"])
    return row


def resolve_day(d: date, today: date, kind: str, row: Attendance | None, leave, joined: date | None, holiday: str | None):
    """Status for one calendar cell. Stored rows win; otherwise derive."""
    if row is not None:
        return row.status
    if joined and d < joined:
        return None  # before joining: blank
    if kind == "holiday":
        return AttendanceStatus.HOLIDAY
    if kind == "weekly_off":
        return AttendanceStatus.WEEKLY_OFF
    if leave and not leave.is_half_day:
        return AttendanceStatus.ON_LEAVE
    if d > today:
        return None  # future working day
    if d == today:
        return "not_checked_in"
    return AttendanceStatus.ABSENT


SUMMARY_KEYS = ["present", "late", "half_day", "absent", "on_leave", "incomplete", "holiday", "weekly_off"]


def month_calendar(user, year: int, month: int) -> dict:
    start = date(year, month, 1)
    end = (date(year + (month == 12), month % 12 + 1, 1)) - timedelta(days=1)
    today = today_ist()
    cfg = get_settings(user.company_id)
    cal = WorkCalendar(user.company_id, start, end, cfg)
    leaves = approved_leaves(user.id, start, end)
    rows = {
        r.date: r
        for r in Attendance.objects.filter(user=user, date__range=(start, end)).select_related("office_location")
    }

    days, summary = [], dict.fromkeys(SUMMARY_KEYS, 0)
    total_minutes = 0
    d = start
    while d <= end:
        kind = cal.day_kind(d)
        row, leave = rows.get(d), leaves.get(d)
        status = resolve_day(d, today, kind, row, leave, user.joining_date, cal.holidays.get(d))
        if status in summary:
            summary[status] += 1
        if row:
            total_minutes += row.worked_minutes
        days.append(
            {
                "date": d,
                "day_kind": kind,
                "status": status,
                "holiday_name": cal.holidays.get(d),
                "leave": _leave_payload(leave),
                "record": serialize_record(row) if row else None,
            }
        )
        d += timedelta(days=1)

    worked_days = summary["present"] + summary["late"] + summary["half_day"] + summary["incomplete"]
    return {
        "year": year,
        "month": month,
        "user": {"id": user.id, "name": user.name, "joining_date": user.joining_date},
        "days": days,
        "summary": {
            **summary,
            "working_days": len([x for x in days if x["day_kind"] == "working"]),
            "worked_minutes": total_minutes,
            "avg_minutes": total_minutes // worked_days if worked_days else 0,
        },
    }


def team_day(viewer, d: date, users) -> list[dict]:
    """Attendance for every visible active user on a date (stored or derived)."""
    from leaves.models import LeaveRequest

    today = today_ist()
    cal = WorkCalendar(viewer.company_id, d, d)
    kind = cal.day_kind(d)
    users = list(users)
    ids = [u.id for u in users]
    rows = {
        r.user_id: r
        for r in Attendance.objects.filter(user_id__in=ids, date=d).select_related("office_location")
    }
    leaves = {
        lr.user_id: lr
        for lr in LeaveRequest.objects.filter(
            user_id__in=ids, status=RequestStatus.APPROVED, from_date__lte=d, to_date__gte=d
        ).select_related("leave_type")
    }
    out = []
    for u in users:
        row, leave = rows.get(u.id), leaves.get(u.id)
        out.append(
            {
                "user": {
                    "id": u.id,
                    "name": u.name,
                    "email": u.email,
                    "designation": u.designation,
                    "office": u.office_location.name if u.office_location else None,
                },
                "status": resolve_day(d, today, kind, row, leave, u.joining_date, cal.holidays.get(d)),
                "leave": _leave_payload(leave),
                "record": serialize_record(row) if row else None,
            }
        )
    return out


# --------------------------------------------------------------------------- close day


@transaction.atomic
def close_day(d: date, company_id: int | None = None) -> dict:
    """Finalise a day (run by cron at 23:55 IST; idempotent, safe to re-run for past dates).

    - Checked in but never checked out -> Incomplete.
    - Working day, no row, approved full-day leave -> On leave.
    - Working day, no row, no leave -> Absent (half-day leave noted in remarks).
    - Holidays / weekly offs: nothing stored (derived on read).
    """
    from accounts.models import User
    from company.models import Company

    counts = {"incomplete": 0, "on_leave": 0, "absent": 0, "skipped_companies": 0}
    companies = Company.objects.all()
    if company_id:
        companies = companies.filter(id=company_id)

    for company in companies:
        cfg = get_settings(company.id)
        cal = WorkCalendar(company.id, d, d, cfg)

        counts["incomplete"] += Attendance.objects.filter(
            company=company, date=d, check_in_at__isnull=False, check_out_at__isnull=True
        ).exclude(status=AttendanceStatus.INCOMPLETE).update(
            status=AttendanceStatus.INCOMPLETE, remarks="No check-out recorded", updated_at=timezone.now()
        )

        if not cal.is_working(d):
            counts["skipped_companies"] += 1
            continue

        users = list(
            User.objects.filter(company=company, is_active=True)
            .exclude(joining_date__gt=d)
            .exclude(attendance__date=d)
            .select_related("office_location")
        )
        if not users:
            continue
        from leaves.models import LeaveRequest

        leaves = {
            lr.user_id: lr
            for lr in LeaveRequest.objects.filter(
                user__in=users, status=RequestStatus.APPROVED, from_date__lte=d, to_date__gte=d
            ).select_related("leave_type")
        }
        new_rows = []
        for u in users:
            leave = leaves.get(u.id)
            if leave and not leave.is_half_day:
                status, remarks = AttendanceStatus.ON_LEAVE, leave.leave_type.name
                counts["on_leave"] += 1
            else:
                status = AttendanceStatus.ABSENT
                remarks = f"Half-day leave ({leave.half} half); no punch" if leave else ""
                counts["absent"] += 1
            new_rows.append(
                Attendance(
                    company=company,
                    user=u,
                    date=d,
                    status=status,
                    source=AttendanceSource.SYSTEM,
                    office_location=u.office_location,
                    remarks=remarks,
                )
            )
        Attendance.objects.bulk_create(new_rows, ignore_conflicts=True)
    return counts
