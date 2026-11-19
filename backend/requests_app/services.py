"""Regularization requests: missed punch, work from home, client visit.

An approved request writes the requested times into that day's Attendance row
(source = regularization) and recomputes the status with the normal rules.
"""

from datetime import date, timedelta

from django.db import transaction
from django.utils import timezone

from attendance.models import Attendance, AttendanceSource
from attendance.services import (
    approved_leaves,
    combine_ist,
    derive_status,
    is_late,
    local,
    today_ist,
    worked_minutes,
)
from company.services import WorkCalendar, get_settings
from core.approvals import can_decide, resolve_approver
from core.constants import RequestStatus
from core.exceptions import ServiceError
from core import notify
from core.models import AuditLog, audit

from .models import RegularizationRequest

MAX_BACKDATE_DAYS = 30


def _check_day(user, d: date, cfg) -> None:
    """The day must be a working day the user could have worked."""
    cal = WorkCalendar(user.company_id, d, d, cfg)
    kind = cal.day_kind(d)
    if kind == "holiday":
        raise ServiceError(f"{d:%d %b} is a holiday ({cal.holidays[d]}).", code="holiday", extra={"field": "date"})
    if kind == "weekly_off":
        raise ServiceError(f"{d:%d %b} is a weekly off.", code="weekly_off", extra={"field": "date"})
    leave = approved_leaves(user.id, d, d).get(d)
    if leave and not leave.is_half_day:
        raise ServiceError(
            f"You're on approved {leave.leave_type.name.lower()} on {d:%d %b}. Cancel the leave first.",
            code="on_leave",
            extra={"field": "date"},
        )


def validate_request(user, data: dict, cfg=None) -> None:
    cfg = cfg or get_settings(user.company_id)
    d: date = data["date"]
    today = today_ist()
    if d > today:
        raise ServiceError("You can't regularize a future date.", code="future_date", extra={"field": "date"})
    if d < today - timedelta(days=MAX_BACKDATE_DAYS):
        raise ServiceError(
            f"Requests must be raised within {MAX_BACKDATE_DAYS} days.", code="too_old", extra={"field": "date"}
        )
    if user.joining_date and d < user.joining_date:
        raise ServiceError("That date is before your joining date.", code="before_joining", extra={"field": "date"})
    if data["check_out_time"] <= data["check_in_time"]:
        raise ServiceError(
            "Check-out must be after check-in.", code="invalid_times", extra={"field": "check_out_time"}
        )
    if d == today and combine_ist(d, data["check_out_time"]) > timezone.now():
        raise ServiceError(
            "Check-out time can't be in the future.", code="invalid_times", extra={"field": "check_out_time"}
        )
    _check_day(user, d, cfg)

    clash = RegularizationRequest.objects.filter(
        user=user, date=d, status__in=[RequestStatus.PENDING, RequestStatus.APPROVED]
    ).first()
    if clash:
        raise ServiceError(
            f"You already have a {clash.get_status_display().lower()} request for {d:%d %b}.",
            code="duplicate_request",
            extra={"field": "date"},
        )
    row = Attendance.objects.filter(user=user, date=d).first()
    if row and row.check_in_at and row.check_out_at:
        raise ServiceError(
            f"Attendance for {d:%d %b} is already complete ({local(row.check_in_at):%I:%M %p} – {local(row.check_out_at):%I:%M %p}).",
            code="already_complete",
            extra={"field": "date"},
        )


@transaction.atomic
def create_request(user, data: dict) -> RegularizationRequest:
    from accounts.models import User

    User.objects.select_for_update(of=("self",)).get(pk=user.pk)  # serialise duplicate submits
    validate_request(user, data)
    req = RegularizationRequest.objects.create(
        company_id=user.company_id,
        user=user,
        date=data["date"],
        type=data["type"],
        check_in_time=data["check_in_time"],
        check_out_time=data["check_out_time"],
        reason=data["reason"].strip(),
        approver=resolve_approver(user),
    )
    notify.regularization_submitted(req)
    return req


def _lock(req_id: int) -> RegularizationRequest:
    return RegularizationRequest.objects.select_for_update().select_related("user").get(pk=req_id)


def apply_to_attendance(req: RegularizationRequest) -> Attendance:
    user = req.user
    cfg = get_settings(user.company_id)
    _check_day(user, req.date, cfg)  # the day may have become a holiday / leave since submission

    cin = combine_ist(req.date, req.check_in_time)
    cout = combine_ist(req.date, req.check_out_time)
    leave = approved_leaves(user.id, req.date, req.date).get(req.date)
    late = is_late(cin, cfg) and not (leave and leave.half == "first")
    minutes = worked_minutes(cin, cout)
    status = derive_status(late=late, minutes=minutes, checked_out=True, cfg=cfg, half_day_leave=bool(leave))
    label = req.get_type_display()

    row = Attendance.objects.select_for_update().filter(user=user, date=req.date).first()
    if row is None:
        row = Attendance(company_id=user.company_id, user=user, date=req.date, office_location_id=user.office_location_id)
    row.check_in_at = cin
    row.check_out_at = cout
    row.worked_minutes = minutes
    row.is_late = late
    row.status = status
    row.source = AttendanceSource.REGULARIZATION
    row.remarks = f"{label} (regularized)"[:255]
    row.save()
    return row


@transaction.atomic
def decide(actor, req_id: int, approve: bool, comment: str = "") -> RegularizationRequest:
    req = _lock(req_id)
    if req.status != RequestStatus.PENDING:
        raise ServiceError(f"This request is already {req.get_status_display().lower()}.", code="not_pending", status_code=409)
    if not can_decide(actor, req):
        raise ServiceError("You can't decide this request.", code="forbidden", status_code=403)

    if approve:
        row = apply_to_attendance(req)
        audit(
            company=req.company,
            action=AuditLog.Action.ATTENDANCE_REGULARIZED,
            actor=actor,
            target_user=req.user,
            message=f"{req.get_type_display()} on {req.date:%d %b %Y} approved; marked {row.get_status_display()}",
            data={"request_id": req.id, "status": row.status, "in": str(req.check_in_time), "out": str(req.check_out_time)},
        )
    req.status = RequestStatus.APPROVED if approve else RequestStatus.REJECTED
    req.decided_by = actor
    req.decided_at = timezone.now()
    req.decision_comment = (comment or "").strip()[:500]
    req.save(update_fields=["status", "decided_by", "decided_at", "decision_comment", "updated_at"])
    notify.regularization_decided(req)
    return req


@transaction.atomic
def cancel(user, req_id: int) -> RegularizationRequest:
    req = _lock(req_id)
    if req.user_id != user.id:
        raise ServiceError("You can only cancel your own requests.", code="forbidden", status_code=403)
    if req.status != RequestStatus.PENDING:
        raise ServiceError(
            f"Only pending requests can be cancelled; this one is {req.get_status_display().lower()}.",
            code="not_pending",
            status_code=409,
        )
    req.status = RequestStatus.CANCELLED
    req.decided_at = timezone.now()
    req.save(update_fields=["status", "decided_at", "updated_at"])
    return req


