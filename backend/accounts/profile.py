"""Employee profile: everything about one person, for the /employees/:id page.

Visibility follows the usual scoping (core.scoping.visible_users):
admin -> anyone in the company, manager -> self + direct reports, employee -> self.
Anyone outside that scope gets a 404, never a 403, so IDs can't be probed.
"""

from collections import Counter
from datetime import date

from django.db.models import Q
from django.shortcuts import get_object_or_404

from attendance.models import Attendance
from attendance.services import serialize_record, today_ist
from core.constants import RequestStatus, Role
from core.models import AuditLog
from core.scoping import visible_users
from leaves.models import LeaveBalance, LeaveRequest
from leaves.services import credit_balances_for_user
from requests_app.models import RegularizationRequest

from .internship import internship_info
from .models import User

PRESENTISH = ("present", "late", "half_day", "incomplete")


def get_visible_person(viewer, user_id: int) -> User:
    """The target user if the viewer may see them (inactive people included), else 404."""
    return get_object_or_404(
        visible_users(viewer).select_related("manager", "office_location", "company"), pk=user_id
    )


def _mini(u: User | None) -> dict | None:
    if u is None:
        return None
    return {"id": u.id, "name": u.name, "email": u.email, "designation": u.designation, "is_active": u.is_active}


def reporting_chain(user: User) -> list[dict]:
    """Manager, their manager, ... (loop-safe, max 10 levels)."""
    chain, seen, cur = [], {user.id}, user.manager
    while cur is not None and cur.id not in seen and len(chain) < 10:
        chain.append(_mini(cur) | {"role": cur.role})
        seen.add(cur.id)
        cur = cur.manager
    return chain


def month_stats(user: User, today: date) -> dict:
    """This month so far: same rules as the attendance calendar (stored rows win, the rest derived)."""
    from reports.services import resolve_range

    start = today.replace(day=1)
    counts = Counter(s for _, _, s, _, _ in resolve_range([user], user.company_id, start, today) if s)
    minutes = list(
        Attendance.objects.filter(user=user, date__range=(start, today), worked_minutes__gt=0).values_list(
            "worked_minutes", flat=True
        )
    )
    attended = sum(counts[k] for k in PRESENTISH)
    expected = attended + counts["absent"]
    return {
        "present": counts["present"] + counts["late"],
        "late": counts["late"],
        "half_day": counts["half_day"],
        "absent": counts["absent"],
        "on_leave": counts["on_leave"],
        "incomplete": counts["incomplete"],
        "avg_minutes": sum(minutes) // len(minutes) if minutes else 0,
        "attendance_rate": round(attended * 100 / expected) if expected else None,
    }


def profile_overview(viewer: User, person: User) -> dict:
    today = today_ist()
    year = today.year
    if person.is_active:
        credit_balances_for_user(person, year)  # self-heal: types added mid-year

    reports = list(
        User.objects.filter(manager=person).order_by("-is_active", "name").values("id", "name", "designation", "is_active")
    )
    today_row = Attendance.objects.filter(user=person, date=today).select_related("office_location").first()
    from leaves.services import visible_balances

    balances = visible_balances(person, year)
    upcoming = (
        LeaveRequest.objects.filter(
            user=person, status__in=[RequestStatus.APPROVED, RequestStatus.PENDING], to_date__gte=today
        )
        .select_related("leave_type")
        .order_by("from_date")[:3]
    )

    return {
        "profile": {
            "id": person.id,
            "employee_code": person.employee_code,
            "name": person.name,
            "email": person.email,
            "phone": person.phone,
            "designation": person.designation,
            "role": person.role,
            "is_active": person.is_active,
            "joining_date": person.joining_date,
            # Day + month only. Colleagues see it only if the person shares it; admins and the person always do.
            "birthday": (
                person.date_of_birth.strftime("%m-%d")
                if person.date_of_birth and (person.show_birthday or viewer.role == Role.ADMIN or viewer.id == person.id)
                else None
            ),
            "manager": _mini(person.manager),
            "office_location": (
                {"id": person.office_location_id, "name": person.office_location.name} if person.office_location else None
            ),
            "invite_pending": not person.has_usable_password(),
            "password_change_pending": bool(person.must_change_password and person.has_usable_password()),
            "remote_allowed": person.remote_allowed,
            "internship": internship_info(person),
            "last_login": person.last_login,
            "created_at": person.created_at,
        },
        "chain": reporting_chain(person),
        "direct_reports": reports,
        "month": month_stats(person, today),
        "today": serialize_record(today_row) if today_row else None,
        "balances": [
            {
                "leave_type": {"id": b.leave_type_id, "name": b.leave_type.name, "color": b.leave_type.color, "is_paid": b.leave_type.is_paid, "for_interns": b.leave_type.for_interns},
                "total": float(b.total),
                "used": float(b.used),
                "available": float(b.available),
            }
            for b in balances
        ],
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
            for lr in upcoming
        ],
        "pending": {
            "leave": LeaveRequest.objects.filter(user=person, status=RequestStatus.PENDING).count(),
            "regularization": RegularizationRequest.objects.filter(user=person, status=RequestStatus.PENDING).count(),
        },
        # Exact stored values for the admin edit form (saving must never blank a field it didn't show).
        "editable": (
            {
                "date_of_birth": person.date_of_birth,
                "internship_start": person.internship_start,
                "internship_end": person.internship_end,
            }
            if viewer.role == Role.ADMIN
            else None
        ),
        "is_self": person.id == viewer.id,
        # Edit / activate / adjust balances are admin-only actions.
        "can_manage": viewer.role == Role.ADMIN,
    }


def activity(viewer: User, person: User, limit: int = 100) -> list[dict]:
    """Audit trail about this person: account changes, balance adjustments, regularizations."""
    logs = (
        AuditLog.objects.filter(company_id=viewer.company_id)
        .filter(Q(target_user=person))
        .select_related("actor")
        .order_by("-created_at")[:limit]
    )
    out = [
        {
            "id": log.id,
            "action": log.action,
            "label": log.get_action_display(),
            "message": log.message,
            "actor": _mini(log.actor),
            "created_at": log.created_at,
        }
        for log in logs
    ]
    # Joining is part of their story even if the account predates the audit log.
    if not any(a["action"] == AuditLog.Action.USER_CREATED for a in out):
        out.append(
            {
                "id": f"joined-{person.id}",
                "action": "joined",
                "label": "Account created",
                "message": f"{person.name} was added to {person.company.name if person.company else 'the company'}",
                "actor": None,
                "created_at": person.created_at,
            }
        )
    return out
