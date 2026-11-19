"""Leave business logic: day counting, balances, crediting and the request lifecycle.

Balance model: days are booked when a request is *applied* (pending + approved both count
as used) and given back on reject / cancel, so two pending requests can't spend the same days.
"""

from datetime import date, timedelta
from decimal import ROUND_FLOOR, Decimal

from django.db import transaction
from django.db.models import F, Q
from django.utils import timezone

from company.services import WorkCalendar, get_settings
from core.approvals import can_decide, resolve_approver
from core.constants import RequestStatus, Role
from core.exceptions import ServiceError
from core import notify
from core.models import AuditLog, audit

from .models import LeaveBalance, LeaveRequest, LeaveRequestCC, LeaveType

HALF = Decimal("0.5")
MAX_BACKDATE_DAYS = 30
MAX_FUTURE_DAYS = 365
MAX_SPAN_DAYS = 92


# ---------------------------------------------------------------------------
# Day counting
# ---------------------------------------------------------------------------
def count_leave_days(company_id: int, start: date, end: date, is_half_day: bool = False, calendar=None) -> Decimal:
    """Working days in [start, end], excluding holidays and weekly offs.

    A half-day request must be a single day and counts 0.5.
    """
    if end < start:
        raise ServiceError("End date can't be before start date.", code="invalid_dates")
    cal = calendar or WorkCalendar(company_id, start, end)
    if is_half_day:
        if start != end:
            raise ServiceError("A half-day leave must start and end on the same day.", code="invalid_half_day")
        return HALF if cal.is_working(start) else Decimal("0")
    return Decimal(len(cal.working_days(start, end)))


# ---------------------------------------------------------------------------
# Crediting
# ---------------------------------------------------------------------------
def prorated_quota(quota: Decimal, joining_date: date | None, year: int) -> Decimal:
    """Pro-rata quota for someone joining during `year`.

    Counts remaining whole months; the joining month counts if they joined on or before the 15th.
    Rounded down to the nearest 0.5 day.
    """
    quota = Decimal(quota)
    if not joining_date or joining_date.year < year:
        return quota
    if joining_date.year > year:
        return Decimal("0")
    months = 12 - joining_date.month + (1 if joining_date.day <= 15 else 0)
    raw = quota * Decimal(months) / Decimal(12)
    return (raw / HALF).to_integral_value(rounding=ROUND_FLOOR) * HALF


def months_due(joining_date: date | None, year: int, today: date | None = None) -> int:
    """Months of `year` a monthly type should have credited by `today` (same joining rule as pro-rata)."""
    today = today or _today()
    if year > today.year or (joining_date and joining_date.year > year):
        return 0
    last = 12 if year < today.year else today.month
    first = 1
    if joining_date and joining_date.year == year:
        first = joining_date.month + (0 if joining_date.day <= 15 else 1)
    return max(0, last - first + 1)


def monthly_credit(quota, months: int) -> Decimal:
    """Credit for `months` of a monthly type, rounded down to 0.5 (cumulative, so halves add up correctly)."""
    raw = Decimal(quota) * Decimal(months) / Decimal(12)
    return (raw / HALF).to_integral_value(rounding=ROUND_FLOOR) * HALF


def _base_credit(lt, joining_date, year, months=None) -> tuple[Decimal, int]:
    """What the system credits for this type: (total, credited_months)."""
    if lt.accrual == "monthly":
        m = months_due(joining_date, year) if months is None else months
        return monthly_credit(lt.yearly_quota, m), m
    return prorated_quota(lt.yearly_quota, joining_date, year), 0


@transaction.atomic
def top_up_monthly(user_ids=None, company_id=None, year: int | None = None) -> int:
    """Add this month's share to every monthly balance that's behind. Idempotent; cheap when nothing is due."""
    year = year or _today().year
    qs = (
        LeaveBalance.objects.select_for_update(of=("self",))
        .filter(year=year, leave_type__accrual="monthly", leave_type__is_paid=True, leave_type__for_interns=False)
        .exclude(user__role=Role.INTERN)
        .select_related("leave_type", "user")
    )
    if user_ids is not None:
        qs = qs.filter(user_id__in=user_ids)
    if company_id is not None:
        qs = qs.filter(company_id=company_id)
    n = 0
    for bal in qs.filter(credited_months__lt=12 if year < _today().year else _today().month):
        due = months_due(bal.user.joining_date, year)
        if due <= bal.credited_months:
            continue
        delta = monthly_credit(bal.leave_type.yearly_quota, due) - monthly_credit(bal.leave_type.yearly_quota, bal.credited_months)
        LeaveBalance.objects.filter(pk=bal.pk).update(total=F("total") + delta, credited_months=due)
        n += 1
    return n


@transaction.atomic
def switch_accrual(lt: LeaveType, old: str) -> None:
    """A type changed yearly <-> monthly: re-base this year's balances, keeping any admin adjustments."""
    year = _today().year
    for bal in LeaveBalance.objects.select_for_update().filter(leave_type=lt, year=year).select_related("user"):
        if bal.user.role == Role.INTERN or not lt.is_paid:
            continue
        joining = bal.user.joining_date
        if old == "monthly":
            old_base = monthly_credit(lt.yearly_quota, bal.credited_months)
        else:
            old_base = prorated_quota(lt.yearly_quota, joining, year)
        extra = bal.total - old_base  # manual adjustments
        new_base, months = _base_credit(lt, joining, year)
        bal.total = new_base + extra
        bal.credited_months = months
        bal.save(update_fields=["total", "credited_months", "updated_at"])


INTERN_LEAVE_NAME = "Leave"


def intern_leave_type(company_id: int) -> LeaveType:
    """The company's single intern leave type ("Leave"), created on first use."""
    lt = LeaveType.objects.filter(company_id=company_id, for_interns=True).first()
    if lt:
        return lt
    name = INTERN_LEAVE_NAME
    if LeaveType.objects.filter(company_id=company_id, name__iexact=name).exists():
        name = "Intern Leave"
    lt, _ = LeaveType.objects.get_or_create(
        company_id=company_id,
        for_interns=True,
        defaults={"name": name, "yearly_quota": 0, "is_paid": False, "allow_half_day": True, "color": "#0ea5e9"},
    )
    return lt


def credit_balances_for_user(user, year: int, prorate: bool = True) -> list[LeaveBalance]:
    """Create this year's balances for every active leave type. Existing balances are left untouched
    (idempotent, so the yearly cron can safely re-run). One INSERT at most, so no transaction needed;
    called on reads too, so it stays cheap when everything already exists."""
    created = []
    if user.role == Role.INTERN:
        types = [intern_leave_type(user.company_id)]  # interns have just "Leave"
    else:
        types = LeaveType.objects.filter(company_id=user.company_id, is_active=True, for_interns=False)
    rows = list(LeaveBalance.objects.filter(user=user, year=year).values_list("leave_type_id", "credited_months", "leave_type__accrual"))
    existing = {r[0] for r in rows}
    for lt in types:
        if lt.id in existing:
            continue
        total, months = _base_credit(lt, user.joining_date if prorate else None, year)
        if not lt.is_paid or user.role == Role.INTERN:  # interns are unpaid: no paid leave
            total, months = 0, 0
        created.append(
            LeaveBalance(company_id=user.company_id, user=user, leave_type=lt, year=year, total=total, credited_months=months)
        )
    if created:
        LeaveBalance.objects.bulk_create(created, ignore_conflicts=True)
    if year == _today().year and user.role != Role.INTERN:
        due = months_due(user.joining_date, year)
        if any(acc == "monthly" and months < due for _, months, acc in rows):  # only touch the DB when a month is due
            top_up_monthly(user_ids=[user.id], year=year)
    return created


def get_balance_for_update(user_id: int, leave_type: LeaveType, year: int) -> LeaveBalance:
    """Row-locked balance (created on the fly if missing, e.g. a type added mid-year)."""
    bal, _ = LeaveBalance.objects.select_for_update().get_or_create(
        user_id=user_id,
        leave_type=leave_type,
        year=year,
        defaults={"company_id": leave_type.company_id, "total": Decimal("0")},
    )
    return bal


def deduct_balance(user_id: int, leave_type: LeaveType, year: int, days: Decimal, *, enforce: bool = True) -> LeaveBalance:
    """Must run inside a transaction. Unpaid types never block."""
    bal = get_balance_for_update(user_id, leave_type, year)
    if enforce and leave_type.is_paid and bal.available < days:
        raise ServiceError(
            f"Insufficient {leave_type.name} balance: {bal.available} day(s) available, {days} requested.",
            code="insufficient_balance",
            extra={"available": float(bal.available), "requested": float(days), "field": "leave_type"},
        )
    LeaveBalance.objects.filter(pk=bal.pk).update(used=F("used") + days)
    bal.refresh_from_db(fields=["used"])
    return bal


def restore_balance(user_id: int, leave_type: LeaveType, year: int, days: Decimal) -> LeaveBalance:
    """Must run inside a transaction."""
    bal = get_balance_for_update(user_id, leave_type, year)
    LeaveBalance.objects.filter(pk=bal.pk).update(used=F("used") - days)
    bal.refresh_from_db(fields=["used"])
    return bal


# ---------------------------------------------------------------------------
# Apply: assessment (powers both the live preview and the final validation)
# ---------------------------------------------------------------------------
def _issue(code: str, message: str, field: str | None = None) -> dict:
    return {"code": code, "message": message, **({"field": field} if field else {})}


def _today() -> date:
    from attendance.services import today_ist

    return today_ist()


def assess(user, leave_type: LeaveType, start: date, end: date, is_half_day: bool = False, half: str = "") -> dict:
    """Day count with a per-day breakdown, the balance after, and every blocking issue."""
    from attendance.models import Attendance

    today = _today()
    if end < start:
        return {"days": 0, "breakdown": [], "balance": None, "issues": [_issue("invalid_dates", "End date can't be before start date.", "to_date")]}
    if (end - start).days >= MAX_SPAN_DAYS:
        return {"days": 0, "breakdown": [], "balance": None, "issues": [_issue("too_long", "A single request can cover at most 3 months.", "to_date")]}

    issues: list[dict] = []
    if start.year == today.year:
        credit_balances_for_user(user, start.year)  # monthly types: include this month's share
    if (user.role == Role.INTERN) != leave_type.for_interns:
        issues.append(_issue("invalid_leave_type", "Choose an active leave type.", "leave_type"))
    cal = WorkCalendar(user.company_id, start, end)
    breakdown, d = [], start
    while d <= end:
        breakdown.append({"date": d, "kind": cal.day_kind(d), "name": cal.holidays.get(d)})
        d += timedelta(days=1)

    if is_half_day:
        if not leave_type.allow_half_day:
            issues.append(_issue("half_day_not_allowed", f"{leave_type.name} can't be taken as a half day.", "is_half_day"))
        if start != end:
            issues.append(_issue("invalid_half_day", "A half-day leave must be a single day.", "to_date"))
        if half not in ("first", "second"):
            issues.append(_issue("half_required", "Choose the first or second half.", "half"))
        days = HALF if cal.is_working(start) else Decimal("0")
    else:
        days = Decimal(len(cal.working_days(start, end)))

    if start.year != end.year:
        issues.append(_issue("spans_years", "Split leave that crosses into a new year into two requests.", "to_date"))
    if start < today - timedelta(days=MAX_BACKDATE_DAYS):
        issues.append(_issue("too_old", f"Leave can be applied at most {MAX_BACKDATE_DAYS} days back.", "from_date"))
    if end > today + timedelta(days=MAX_FUTURE_DAYS):
        issues.append(_issue("too_far", "Leave can be planned up to a year ahead.", "to_date"))
    if user.joining_date and start < user.joining_date:
        issues.append(_issue("before_joining", "That's before your joining date.", "from_date"))
    if days == 0:
        issues.append(_issue("no_working_days", "The selected dates are all holidays or weekly offs.", "from_date"))

    for other in LeaveRequest.objects.filter(
        user=user, status__in=[RequestStatus.PENDING, RequestStatus.APPROVED], from_date__lte=end, to_date__gte=start
    ).select_related("leave_type"):
        # Two half days on the same date in different sessions are fine.
        if is_half_day and other.is_half_day and other.half and half and other.half != half:
            continue
        issues.append(
            _issue(
                "overlap",
                f"Overlaps your {other.get_status_display().lower()} {other.leave_type.name.lower()} "
                f"({other.from_date:%d %b} – {other.to_date:%d %b}).",
                "from_date",
            )
        )
        break

    if not is_half_day:
        punched = (
            Attendance.objects.filter(user=user, date__range=(start, end), check_in_at__isnull=False)
            .order_by("date")
            .values_list("date", flat=True)
            .first()
        )
        if punched:
            issues.append(
                _issue("attendance_exists", f"You have attendance on {punched:%d %b}. Take a half day or pick other dates.", "from_date")
            )

    balance = None
    if start.year == end.year:
        bal = LeaveBalance.objects.filter(user=user, leave_type=leave_type, year=start.year).first()
        total = bal.total if bal else Decimal("0")
        used = bal.used if bal else Decimal("0")
        balance = {
            "year": start.year,
            "total": float(total),
            "used": float(used),
            "available": float(total - used),
            "after": float(total - used - days),
            "is_paid": leave_type.is_paid,
        }
        if leave_type.is_paid and days > total - used:
            issues.append(
                _issue(
                    "insufficient_balance",
                    f"Only {total - used} day(s) of {leave_type.name} available; this needs {days}.",
                    "leave_type",
                )
            )
    return {"days": float(days), "breakdown": breakdown, "balance": balance, "issues": issues}


def resolve_cc(user, cc_ids, approver) -> list[int]:
    """Requested CCs (must be active people in the company) + the company default CC; never self/approver."""
    from accounts.models import User

    cc_ids = set(cc_ids or [])
    if cc_ids:
        valid = set(User.objects.filter(company_id=user.company_id, is_active=True, id__in=cc_ids).values_list("id", flat=True))
        if bad := cc_ids - valid:
            raise ServiceError(
                "Some CC recipients aren't active people in your company.",
                code="invalid_cc",
                extra={"field": "cc_ids", "ids": sorted(bad)},
            )
    cfg = get_settings(user.company_id)
    cc_ids |= set(cfg.default_cc.filter(is_active=True).values_list("id", flat=True))
    cc_ids.discard(user.id)
    if approver:
        cc_ids.discard(approver.id)
    return sorted(cc_ids)


def leave_type_for(user, leave_type_id) -> LeaveType | None:
    """Interns always use the intern "Leave" type; everyone else picks one of the normal active types."""
    if user.role == Role.INTERN:
        return intern_leave_type(user.company_id)
    if not leave_type_id:
        return None
    return LeaveType.objects.filter(company_id=user.company_id, is_active=True, for_interns=False, pk=leave_type_id).first()


@transaction.atomic
def apply_leave(user, data: dict) -> LeaveRequest:
    from accounts.models import User

    User.objects.select_for_update(of=("self",)).get(pk=user.pk)  # serialise double-submits
    lt = leave_type_for(user, data.get("leave_type_id"))
    if not lt:
        raise ServiceError("Choose an active leave type.", code="invalid_leave_type", extra={"field": "leave_type"})
    is_half = bool(data.get("is_half_day"))
    half = data.get("half", "") if is_half else ""
    result = assess(user, lt, data["from_date"], data["to_date"], is_half, half)
    if result["issues"]:
        first = result["issues"][0]
        raise ServiceError(first["message"], code=first["code"], extra={k: v for k, v in first.items() if k not in ("code", "message")})

    days = Decimal(str(result["days"]))
    if not lt.for_interns:  # intern leave is counted when approved, not when applied
        deduct_balance(user.id, lt, data["from_date"].year, days)  # re-checked under the row lock
    approver = resolve_approver(user)
    req = LeaveRequest.objects.create(
        company_id=user.company_id,
        user=user,
        leave_type=lt,
        from_date=data["from_date"],
        to_date=data["to_date"],
        is_half_day=is_half,
        half=half,
        days=days,
        reason=data["reason"].strip(),
        approver=approver,
    )
    LeaveRequestCC.objects.bulk_create(
        [LeaveRequestCC(request=req, user_id=uid) for uid in resolve_cc(user, data.get("cc_ids"), approver)]
    )
    notify.leave_applied(req)
    return req


# ---------------------------------------------------------------------------
# Decide / cancel
# ---------------------------------------------------------------------------
def _lock_request(req_id: int) -> LeaveRequest:
    return LeaveRequest.objects.select_for_update(of=("self",)).select_related("leave_type", "user").get(pk=req_id)


def _mark_attendance_on_leave(req: LeaveRequest) -> int:
    """Approving leave for days already closed as Absent converts them to On leave."""
    from attendance.models import Attendance, AttendanceStatus

    absent = Attendance.objects.filter(
        user_id=req.user_id, status=AttendanceStatus.ABSENT, check_in_at__isnull=True
    )
    if req.is_half_day:
        return absent.filter(date=req.from_date).update(
            remarks=f"Half-day {req.leave_type.name} ({req.half} half); no punch"
        )
    return absent.filter(date__range=(req.from_date, req.to_date)).update(
        status=AttendanceStatus.ON_LEAVE, remarks=req.leave_type.name
    )


def _revert_attendance(req: LeaveRequest) -> int:
    from attendance.models import Attendance, AttendanceSource, AttendanceStatus

    return Attendance.objects.filter(
        user_id=req.user_id,
        date__range=(req.from_date, req.to_date),
        status=AttendanceStatus.ON_LEAVE,
        source=AttendanceSource.SYSTEM,
    ).update(status=AttendanceStatus.ABSENT, remarks="")


@transaction.atomic
def decide_leave(actor, req_id: int, approve: bool, comment: str = "") -> LeaveRequest:
    req = _lock_request(req_id)
    if req.status != RequestStatus.PENDING:
        raise ServiceError(f"This request is already {req.get_status_display().lower()}.", code="not_pending", status_code=409)
    if not can_decide(actor, req):
        raise ServiceError("You can't decide this request.", code="forbidden", status_code=403)
    if approve:
        req.status = RequestStatus.APPROVED
        _mark_attendance_on_leave(req)
        if req.leave_type.for_interns:  # intern count goes up on approval
            deduct_balance(req.user_id, req.leave_type, req.from_date.year, req.days, enforce=False)
    else:
        req.status = RequestStatus.REJECTED
        if not req.leave_type.for_interns:
            restore_balance(req.user_id, req.leave_type, req.from_date.year, req.days)
    req.decided_by = actor
    req.decided_at = timezone.now()
    req.decision_comment = (comment or "").strip()[:500]
    req.save(update_fields=["status", "decided_by", "decided_at", "decision_comment", "updated_at"])
    notify.leave_decided(req)
    return req


@transaction.atomic
def cancel_leave(user, req_id: int) -> LeaveRequest:
    req = _lock_request(req_id)
    if req.user_id != user.id:
        raise ServiceError("You can only cancel your own leave.", code="forbidden", status_code=403)
    if req.status not in (RequestStatus.PENDING, RequestStatus.APPROVED):
        raise ServiceError(f"This request is already {req.get_status_display().lower()}.", code="not_pending", status_code=409)
    if req.status == RequestStatus.APPROVED and req.from_date <= _today():
        raise ServiceError(
            "Approved leave can only be cancelled before it starts. Ask your admin for help.",
            code="already_started",
            status_code=409,
        )
    was_approved = req.status == RequestStatus.APPROVED
    req.status = RequestStatus.CANCELLED
    if not was_approved:
        req.decided_at = timezone.now()
    req.save(update_fields=["status", "decided_at", "updated_at"])
    if was_approved or not req.leave_type.for_interns:  # pending intern leave was never counted
        restore_balance(req.user_id, req.leave_type, req.from_date.year, req.days)
    if was_approved:
        _revert_attendance(req)
    notify.leave_cancelled(req, was_approved)
    return req


# ---------------------------------------------------------------------------
# Admin balance adjustment
# ---------------------------------------------------------------------------
@transaction.atomic
def adjust_balance(actor, target, leave_type: LeaveType, year: int, delta: Decimal, reason: str) -> LeaveBalance:
    """Change a balance's total (positive = grant, negative = deduct). Always audited."""
    if target.company_id != actor.company_id or leave_type.company_id != actor.company_id:
        raise ServiceError("Not found.", code="not_found", status_code=404)
    if delta == 0:
        raise ServiceError("Enter a non-zero adjustment.", code="invalid_delta", extra={"field": "delta"})
    bal = get_balance_for_update(target.id, leave_type, year)
    old = bal.total
    new_total = old + delta
    if new_total < 0:
        raise ServiceError(f"Total can't go below zero (currently {old}).", code="invalid_delta", extra={"field": "delta"})
    if new_total < bal.used:
        raise ServiceError(
            f"{target.name} has already used or booked {bal.used} day(s); the total can't go below that.",
            code="below_used",
            extra={"field": "delta"},
        )
    LeaveBalance.objects.filter(pk=bal.pk).update(total=new_total)
    bal.refresh_from_db()
    sign = "+" if delta > 0 else ""
    audit(
        company=actor.company,
        action=AuditLog.Action.LEAVE_BALANCE_ADJUSTED,
        actor=actor,
        target_user=target,
        message=f"{leave_type.name} {year}: {old} → {new_total} ({sign}{delta}). {reason}".strip(),
        data={"leave_type": leave_type.id, "year": year, "old": str(old), "new": str(new_total), "delta": str(delta), "reason": reason},
    )
    return bal


# ---------------------------------------------------------------------------
# Read models
# ---------------------------------------------------------------------------
def team_member_ids(viewer) -> list[int]:
    """Team calendar audience: admin -> company; manager -> self + reports + own manager;
    employee -> self + manager + peers sharing that manager."""
    from accounts.models import User

    qs = User.objects.filter(company_id=viewer.company_id, is_active=True)
    if viewer.role == Role.ADMIN:
        return list(qs.values_list("id", flat=True))
    q = Q(id=viewer.id) | Q(manager_id=viewer.id)
    if viewer.manager_id:
        q |= Q(id=viewer.manager_id)
        if viewer.role == Role.EMPLOYEE:
            q |= Q(manager_id=viewer.manager_id)
    return list(qs.filter(q).values_list("id", flat=True))


def on_leave_on(company_id: int, d: date):
    """Approved leave covering `d` across the company (shown to everyone, like a team board)."""
    return (
        LeaveRequest.objects.filter(
            company_id=company_id, status=RequestStatus.APPROVED, from_date__lte=d, to_date__gte=d, user__is_active=True
        )
        .select_related("user", "leave_type")
        .order_by("user__name")
    )



@transaction.atomic
def rebalance_for_role_change(user, old_role: str, new_role: str) -> None:
    """Keep paid-leave balances consistent when someone becomes / stops being an intern (current year only).

    - Becoming an intern: paid totals drop to what's already used (nothing more to take).
    - Intern -> staff: paid totals become the pro-rata quota from today, like a new joiner.
    """
    if (old_role == Role.INTERN) == (new_role == Role.INTERN):
        return
    today = _today()
    credit_balances_for_user(user, today.year)  # make sure rows exist
    paid = LeaveBalance.objects.select_for_update().filter(
        user=user, year=today.year, leave_type__is_paid=True
    ).select_related("leave_type")
    for bal in paid:
        if new_role == Role.INTERN:
            bal.total = bal.used
            bal.credited_months = 12  # nothing more accrues while they're an intern
        else:
            base, months = _base_credit(bal.leave_type, today, today.year)  # like a new joiner from today
            bal.total = max(bal.used, base)
            bal.credited_months = months
        bal.save(update_fields=["total", "credited_months", "updated_at"])


def visible_balances(user, year: int):
    """Balances to show for a person: interns see only their "Leave" count; others never see it."""
    qs = LeaveBalance.objects.filter(user=user, year=year).select_related("leave_type")
    if year == _today().year:
        credit_balances_for_user(user, year)  # rows exist + this month's share is in
    if user.role == Role.INTERN:
        return qs.filter(leave_type__for_interns=True)
    return qs.filter(leave_type__is_active=True, leave_type__for_interns=False)
