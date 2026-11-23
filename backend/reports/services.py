"""Dashboards (one aggregated payload per role) and report data.

Reports return JSON; the frontend turns them into Excel. Every user list goes through
`visible_users`, so managers only ever see their own team.
"""

from collections import Counter, defaultdict
from datetime import date, timedelta

from django.db.models import Count, Q

from accounts.models import User
from attendance.missed import team_forgot
from attendance.missed import unresolved as unresolved_checkouts
from attendance.models import Attendance
from attendance.services import resolve_day, today_ist, today_state, tracked_from
from company.models import Holiday
from company.services import WorkCalendar
from core.approvals import decidable_q
from core.constants import RequestStatus, Role
from core.exceptions import ServiceError
from core.scoping import visible_users
from leaves.models import LeaveBalance, LeaveRequest
from requests_app.models import RegularizationRequest

MAX_REPORT_DAYS = 93
PRESENTISH = {"present", "late", "half_day", "incomplete"}


# --------------------------------------------------------------------------- shared


def _approved_leave_map(user_ids, start: date, end: date) -> dict[tuple[int, date], LeaveRequest]:
    out = {}
    for lr in LeaveRequest.objects.filter(
        user_id__in=user_ids, status=RequestStatus.APPROVED, from_date__lte=end, to_date__gte=start
    ).select_related("leave_type"):
        d = max(lr.from_date, start)
        while d <= min(lr.to_date, end):
            out[(lr.user_id, d)] = lr
            d += timedelta(days=1)
    return out


def resolve_range(users: list, company_id: int, start: date, end: date):
    """Yield (user, date, status, row) for every user/day, stored or derived. 3 queries total."""
    today = today_ist()
    cal = WorkCalendar(company_id, start, end)
    ids = [u.id for u in users]
    rows = {
        (r.user_id, r.date): r
        for r in Attendance.objects.filter(user_id__in=ids, date__range=(start, end)).select_related("office_location")
    }
    leaves = _approved_leave_map(ids, start, end)
    days = [start + timedelta(days=i) for i in range((end - start).days + 1)]
    for u in users:
        for d in days:
            row = rows.get((u.id, d))
            status = resolve_day(
                d, today, cal.day_kind(d), row, leaves.get((u.id, d)), tracked_from(u.joining_date, cal.settings), cal.holidays.get(d)
            )
            yield u, d, status, row, leaves.get((u.id, d))


def _range(start: date | None, end: date | None) -> tuple[date, date]:
    today = today_ist()
    start = start or today.replace(day=1)
    end = end or today
    if end < start:
        raise ServiceError("End date can't be before start date.", code="invalid_range", extra={"field": "to"})
    if (end - start).days >= MAX_REPORT_DAYS:
        raise ServiceError(f"Pick a range of at most {MAX_REPORT_DAYS} days.", code="range_too_long", extra={"field": "to"})
    return start, end


# --------------------------------------------------------------------------- dashboard


def _pending_counts(user) -> dict:
    return {
        "leave": LeaveRequest.objects.filter(decidable_q(user)).count(),
        "regularization": RegularizationRequest.objects.filter(decidable_q(user)).count(),
    }


def internships_needing_attention(people, today: date, within_days: int = 30) -> list[dict]:
    """Active interns whose internship ends within `within_days`, or has already ended (still active = needs a decision)."""
    from accounts.internship import internship_info

    out = []
    for u in people:
        if u.role != Role.INTERN or not u.internship_end:
            continue
        info = internship_info(u, today)
        if info["days_left"] is not None and info["days_left"] <= within_days:
            out.append({"user": {"id": u.id, "name": u.name, "designation": u.designation}, **info})
    return sorted(out, key=lambda x: x["days_left"])


def dashboard(user) -> dict:
    today = today_ist()
    month_start = today.replace(day=1)

    # --- me
    my_month = Counter(
        s
        for _, _, s, _, _ in resolve_range([user], user.company_id, month_start, today)
        if s
    )
    worked = list(
        Attendance.objects.filter(user=user, date__range=(month_start, today), worked_minutes__gt=0).values_list(
            "worked_minutes", flat=True
        )
    )
    from leaves.services import visible_balances

    balances = visible_balances(user, today.year)
    my_pending = {
        "leave": LeaveRequest.objects.filter(user=user, status=RequestStatus.PENDING).count(),
        "regularization": RegularizationRequest.objects.filter(user=user, status=RequestStatus.PENDING).count(),
    }
    upcoming_leave = (
        LeaveRequest.objects.filter(user=user, status__in=[RequestStatus.APPROVED, RequestStatus.PENDING], to_date__gte=today)
        .select_related("leave_type")
        .order_by("from_date")[:3]
    )
    holidays = Holiday.objects.filter(company_id=user.company_id, date__gte=today).order_by("date")[:4]
    on_leave = (
        LeaveRequest.objects.filter(
            company_id=user.company_id, status=RequestStatus.APPROVED, from_date__lte=today, to_date__gte=today, user__is_active=True
        )
        .select_related("user", "leave_type")
        .order_by("user__name")
    )

    data = {
        "role": user.role,
        "today": today_state(user),
        "me": {
            "month": {
                "present": my_month["present"] + my_month["late"],
                "late": my_month["late"],
                "half_day": my_month["half_day"],
                "absent": my_month["absent"],
                "on_leave": my_month["on_leave"],
                "incomplete": my_month["incomplete"],
                "avg_minutes": sum(worked) // len(worked) if worked else 0,
            },
            "balances": [
                {
                    "leave_type": {"id": b.leave_type_id, "name": b.leave_type.name, "color": b.leave_type.color, "is_paid": b.leave_type.is_paid, "for_interns": b.leave_type.for_interns},
                    "total": float(b.total),
                    "used": float(b.used),
                    "available": float(b.available),
                }
                for b in balances
            ],
            "pending": my_pending,
            # Days they checked in but never out, not yet fixed (newest first).
            "missed_checkouts": [{"date": r.date, "check_in_at": r.check_in_at} for r in unresolved_checkouts(user)[:5]],
            "upcoming_leave": [
                {
                    "id": lr.id,
                    "type": lr.leave_type.name,
                    "color": lr.leave_type.color,
                    "from_date": lr.from_date,
                    "to_date": lr.to_date,
                    "days": float(lr.days),
                    "status": lr.status,
                }
                for lr in upcoming_leave
            ],
        },
        "holidays": [{"date": h.date, "name": h.name} for h in holidays],
        "on_leave_today": [
            {
                "user": {"id": lr.user_id, "name": lr.user.name, "designation": lr.user.designation},
                "type": lr.leave_type.name,
                "color": lr.leave_type.color,
                "is_half_day": lr.is_half_day,
                "half": lr.half or None,
                "to_date": lr.to_date,
            }
            for lr in on_leave[:8]
        ],
        "on_leave_count": on_leave.count(),
    }

    if user.role in (Role.MANAGER, Role.ADMIN):
        team_qs = visible_users(user).filter(is_active=True)
        if user.role == Role.MANAGER:
            team_qs = team_qs.exclude(id=user.id)  # a manager's "team" is their reports
        team = list(team_qs)
        counts = Counter(s or "none" for _, _, s, _, _ in resolve_range(team, user.company_id, today, today))
        pending = _pending_counts(user)
        approvals = []
        for lr in LeaveRequest.objects.filter(decidable_q(user)).select_related("user", "leave_type").order_by("from_date")[:5]:
            approvals.append(
                {
                    "kind": "leave",
                    "id": lr.id,
                    "user": {"id": lr.user_id, "name": lr.user.name},
                    "title": f"{lr.leave_type.name} · {float(lr.days):g} day{'s' if lr.days != 1 else ''}",
                    "from_date": lr.from_date,
                    "to_date": lr.to_date,
                    "created_at": lr.created_at,
                }
            )
        for rr in RegularizationRequest.objects.filter(decidable_q(user)).select_related("user").order_by("date")[:5]:
            approvals.append(
                {
                    "kind": "regularization",
                    "id": rr.id,
                    "user": {"id": rr.user_id, "name": rr.user.name},
                    "title": rr.get_type_display(),
                    "from_date": rr.date,
                    "to_date": rr.date,
                    "created_at": rr.created_at,
                }
            )
        approvals.sort(key=lambda a: a["created_at"])
        data["team"] = {
            "size": len(team),
            "today": dict(counts),
            "pending": pending,
            "approvals": approvals[:6],
            "internships": internships_needing_attention(team, today),
            "forgot_checkout": team_forgot([u.id for u in team], today),
        }

    if user.role == Role.ADMIN:
        people = User.objects.filter(company_id=user.company_id)
        agg = people.aggregate(
            active=Count("id", filter=Q(is_active=True)),
            managers=Count("id", filter=Q(is_active=True, role=Role.MANAGER)),
            joiners=Count("id", filter=Q(is_active=True, joining_date__gte=month_start)),
            no_office=Count("id", filter=Q(is_active=True, office_location__isnull=True)),
        )
        # Attendance trend: last 10 working days, % of eligible people who attended.
        cal = WorkCalendar(user.company_id, today - timedelta(days=30), today)
        work_days = [d for d in cal.working_days(today - timedelta(days=30), today)][-10:]
        trend = []
        if work_days:
            active = list(people.filter(is_active=True))
            per_day: dict[date, Counter] = defaultdict(Counter)
            for _, d, s, _, _ in resolve_range(active, user.company_id, work_days[0], today):
                if d in work_days and s:
                    per_day[d][s] += 1
            for d in work_days:
                c = per_day[d]
                attended = sum(c[k] for k in PRESENTISH)
                missing = c["absent"] + (c["not_checked_in"] if d == today else 0)
                eligible = attended + missing  # people on leave don't count against the rate
                trend.append(
                    {
                        "date": d,
                        "present": c["present"],
                        "late": c["late"],
                        "half_day": c["half_day"],
                        "absent": missing,
                        "on_leave": c["on_leave"],
                        "rate": round(attended * 100 / eligible) if eligible else 0,
                    }
                )
        data["company"] = {**agg, "trend": trend}
    return data


# --------------------------------------------------------------------------- reports


def _people(viewer, user_id=None, office_id=None, include_inactive=False):
    qs = visible_users(viewer).select_related("office_location", "manager").order_by("name")
    if not include_inactive:
        qs = qs.filter(is_active=True)
    if user_id:
        qs = qs.filter(id=user_id)
    if office_id:
        qs = qs.filter(office_location_id=office_id)
    return list(qs)


def attendance_summary(viewer, start=None, end=None, user_id=None, office_id=None) -> dict:
    start, end = _range(start, end)
    users = _people(viewer, user_id, office_id)
    agg: dict[int, Counter] = defaultdict(Counter)
    minutes: dict[int, list[int]] = defaultdict(list)
    checkins: dict[int, list[int]] = defaultdict(list)
    for u, _d, status, row, _l in resolve_range(users, viewer.company_id, start, end):
        if status:
            agg[u.id][status] += 1
        if row and row.worked_minutes:
            minutes[u.id].append(row.worked_minutes)
        if row and row.check_in_at:
            t = row.check_in_at.astimezone(_ist()).time()
            checkins[u.id].append(t.hour * 60 + t.minute)
    cal = WorkCalendar(viewer.company_id, start, end)
    working = len(cal.working_days(start, end))
    results = []
    for u in users:
        c = agg[u.id]
        attended = sum(c[k] for k in PRESENTISH)
        eligible = attended + c["absent"]
        avg_in = sum(checkins[u.id]) // len(checkins[u.id]) if checkins[u.id] else None
        results.append(
            {
                "user": {"id": u.id, "name": u.name, "email": u.email, "designation": u.designation, "employee_code": u.employee_code},
                "office": u.office_location.name if u.office_location else None,
                "manager": u.manager.name if u.manager else None,
                "working_days": working,
                "present": c["present"],
                "late": c["late"],
                "half_day": c["half_day"],
                "incomplete": c["incomplete"],
                "absent": c["absent"],
                "on_leave": c["on_leave"],
                "worked_minutes": sum(minutes[u.id]),
                "avg_minutes": sum(minutes[u.id]) // len(minutes[u.id]) if minutes[u.id] else 0,
                "avg_check_in": f"{avg_in // 60:02d}:{avg_in % 60:02d}" if avg_in is not None else None,
                "attendance_rate": round(attended * 100 / eligible) if eligible else None,
            }
        )
    return {"from": start, "to": end, "working_days": working, "results": results}


def attendance_daily(viewer, start=None, end=None, user_id=None, office_id=None) -> dict:
    start, end = _range(start, end)
    users = _people(viewer, user_id, office_id)
    ist = _ist()
    out = []
    for u, d, status, row, leave in resolve_range(users, viewer.company_id, start, end):
        if not status:
            continue
        out.append(
            {
                "user": {"id": u.id, "name": u.name, "employee_code": u.employee_code},
                "date": d,
                "status": status,
                "check_in": row.check_in_at.astimezone(ist).strftime("%H:%M") if row and row.check_in_at else None,
                "check_out": row.check_out_at.astimezone(ist).strftime("%H:%M") if row and row.check_out_at else None,
                "worked_minutes": row.worked_minutes if row else 0,
                "distance_m": round(row.check_in_distance_m) if row and row.check_in_distance_m is not None else None,
                "office": row.office_location.name if row and row.office_location else None,
                "source": row.source if row else None,
                "remarks": (row.remarks if row else "") or (leave.leave_type.name if leave else ""),
                "work_summary": row.work_summary if row else "",
            }
        )
    out.sort(key=lambda r: (r["date"], r["user"]["name"]), reverse=False)
    return {"from": start, "to": end, "results": out}


def leave_report(viewer, year: int | None = None, user_id=None) -> dict:
    year = year or today_ist().year
    users = _people(viewer, user_id)
    ids = [u.id for u in users]
    from leaves.models import LeaveType
    from leaves.services import top_up_monthly

    if year == today_ist().year:
        top_up_monthly(user_ids=ids, year=year)

    types = list(LeaveType.objects.filter(company_id=viewer.company_id, is_active=True).order_by("name"))
    bals = defaultdict(dict)
    for b in LeaveBalance.objects.filter(user_id__in=ids, year=year):
        bals[b.user_id][b.leave_type_id] = {"total": float(b.total), "used": float(b.used), "available": float(b.available)}
    taken = defaultdict(dict)
    for row in (
        LeaveRequest.objects.filter(user_id__in=ids, status=RequestStatus.APPROVED, from_date__year=year)
        .values("user_id", "leave_type_id")
        .annotate(n=Count("id"))
    ):
        taken[row["user_id"]][row["leave_type_id"]] = row["n"]
    requests = (
        LeaveRequest.objects.filter(user_id__in=ids, from_date__year=year)
        .select_related("user", "leave_type", "decided_by")
        .order_by("-from_date")
    )
    return {
        "year": year,
        "types": [{"id": t.id, "name": t.name, "color": t.color, "is_paid": t.is_paid} for t in types],
        "results": [
            {"user": {"id": u.id, "name": u.name, "email": u.email, "designation": u.designation, "employee_code": u.employee_code}, "balances": bals[u.id], "approved_requests": taken[u.id]}
            for u in users
        ],
        "requests": [
            {
                "id": r.id,
                "user": {"id": r.user_id, "name": r.user.name, "employee_code": r.user.employee_code},
                "leave_type": r.leave_type.name,
                "from_date": r.from_date,
                "to_date": r.to_date,
                "days": float(r.days),
                "is_half_day": r.is_half_day,
                "status": r.status,
                "reason": r.reason,
                "decided_by": r.decided_by.name if r.decided_by else None,
                "applied_on": r.created_at,
            }
            for r in requests[:2000]
        ],
    }


def _ist():
    from attendance.services import IST

    return IST

