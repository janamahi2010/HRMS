"""Workflow notification emails (leave + regularization).

Every function is safe to call inside a transaction: delivery is deferred to
on_commit and runs in a background thread (see core.email), so a slow or broken
SMTP server never affects the request.
"""

from django.conf import settings

from .constants import Role
from .email import send_email_async

TEMPLATE = "emails/notification.html"
BADGES = {
    "approved": ("Approved", "#ecfdf5", "#047857"),
    "rejected": ("Rejected", "#fef2f2", "#b91c1c"),
    "cancelled": ("Cancelled", "#f3f4f6", "#374151"),
    "pending": ("Needs your approval", "#fffbeb", "#b45309"),
}


def _url(path: str) -> str:
    return f"{settings.FRONTEND_URL.rstrip('/')}{path}"


def _approvers(req) -> list:
    """The named approver, or every active admin (except the requester) for the admin pool."""
    if req.approver_id and req.approver.is_active:
        return [req.approver]
    from accounts.models import User

    return list(User.objects.filter(company_id=req.company_id, role=Role.ADMIN, is_active=True).exclude(pk=req.user_id))


def _days(n) -> str:
    v = float(n)
    return f"{v:g} day{'s' if v != 1 else ''}"


def _leave_dates(req) -> str:
    if req.is_half_day:
        return f"{req.from_date:%a, %d %b %Y} ({req.get_half_display().lower()})"
    if req.from_date == req.to_date:
        return f"{req.from_date:%a, %d %b %Y}"
    return f"{req.from_date:%d %b} – {req.to_date:%d %b %Y}"


def _inapp(recipients, kind: str, title: str, *, body: str = "", link: str = "", actor=None) -> None:
    """Bell notification alongside the email (same moment, same people)."""
    from notifications.services import notify

    notify(recipients, kind, title, body=body, link=link, actor=actor)


def _send_each(recipients, subject: str, base_ctx: dict, cc=()):
    """One personalised email per recipient ("Hi Priya"), sharing the CC list."""
    for r in recipients:
        send_email_async(subject, TEMPLATE, {**base_ctx, "recipient_name": r.name.split(" ")[0]}, to=[r.email], cc=cc)


# --------------------------------------------------------------------------- leave


def leave_applied(req) -> None:
    span = f"{_leave_dates(req)} · {_days(req.days)}"
    _inapp(_approvers(req), "leave_applied", f"{req.user.name} applied for {req.leave_type.name.lower()}", body=span, link="/leave?tab=approvals", actor=req.user)
    _inapp(req.cc_users.filter(is_active=True), "leave_cc", f"{req.user.name} applied for leave (you're CC'd)", body=span, link="/leave?tab=cc", actor=req.user)
    rows = [
        ("Employee", req.user.name),
        ("Type", req.leave_type.name),
        ("Dates", _leave_dates(req)),
        ("Days", _days(req.days)),
    ]
    badge, bg, fg = BADGES["pending"]
    _send_each(
        _approvers(req),
        f"Leave request from {req.user.name}: {_leave_dates(req)}",
        {
            "company": req.company,
            "heading": f"{req.user.name} applied for {req.leave_type.name.lower()}",
            "intro": "Please review and approve or reject this request.",
            "rows": rows,
            "quote": req.reason,
            "link": _url("/leave?tab=approvals"),
            "cta": "Review request",
            "badge": badge,
            "badge_bg": bg,
            "badge_fg": fg,
        },
    )
    cc_users = list(req.cc_users.filter(is_active=True))
    _send_each(
        cc_users,
        f"FYI: {req.user.name} applied for leave ({_leave_dates(req)})",
        {
            "company": req.company,
            "heading": f"{req.user.name} applied for leave",
            "intro": f"You've been CC'd on this request for your information. {req.approver.name if req.approver else 'An admin'} will review it.",
            "rows": rows,
            "quote": req.reason,
            "link": _url("/leave?tab=cc"),
            "cta": "View request",
        },
    )


def leave_decided(req) -> None:
    badge, bg, fg = BADGES[req.status]
    verb = "approved" if req.status == "approved" else "rejected"
    note = f"{_leave_dates(req)} · by {req.decided_by.name}" + (f" · \"{req.decision_comment}\"" if req.decision_comment else "")
    _inapp([req.user], f"leave_{verb}", f"Your {req.leave_type.name.lower()} was {verb}", body=note, link="/leave", actor=req.decided_by)
    _inapp(req.cc_users.filter(is_active=True), "leave_cc", f"{req.user.name}'s leave was {verb}", body=note, link="/leave?tab=cc", actor=req.decided_by)
    rows = [("Type", req.leave_type.name), ("Dates", _leave_dates(req)), ("Days", _days(req.days)), ("Decided by", req.decided_by.name)]
    ctx = {
        "company": req.company,
        "rows": rows,
        "quote": req.decision_comment,
        "quote_label": "Comment",
        "badge": badge,
        "badge_bg": bg,
        "badge_fg": fg,
    }
    _send_each(
        [req.user],
        f"Your leave was {verb}: {_leave_dates(req)}",
        {
            **ctx,
            "heading": f"Your {req.leave_type.name.lower()} was {verb}",
            "intro": "Enjoy your time off!" if verb == "approved" else "The days have been returned to your balance.",
            "link": _url("/leave"),
            "cta": "Open leave",
        },
        cc=[u.email for u in req.cc_users.filter(is_active=True)],
    )


def leave_cancelled(req, was_approved: bool) -> None:
    _inapp(
        _approvers(req),
        "leave_cancelled",
        f"{req.user.name} cancelled {'their approved' if was_approved else 'a pending'} leave",
        body=_leave_dates(req),
        link="/leave?tab=team",
        actor=req.user,
    )
    if not was_approved:
        return  # withdrawing a pending request is quiet; it simply leaves the queue
    badge, bg, fg = BADGES["cancelled"]
    _send_each(
        _approvers(req),
        f"{req.user.name} cancelled approved leave ({_leave_dates(req)})",
        {
            "company": req.company,
            "heading": f"{req.user.name} cancelled their leave",
            "intro": "This previously approved leave was cancelled before it started. The days are back in their balance.",
            "rows": [("Type", req.leave_type.name), ("Dates", _leave_dates(req)), ("Days", _days(req.days))],
            "link": _url("/leave?tab=team"),
            "cta": "View team leave",
            "badge": badge,
            "badge_bg": bg,
            "badge_fg": fg,
        },
        cc=[u.email for u in req.cc_users.filter(is_active=True)],
    )


# --------------------------------------------------------------------------- regularization


def _reg_rows(req):
    return [
        ("Employee", req.user.name),
        ("Type", req.get_type_display()),
        ("Date", f"{req.date:%a, %d %b %Y}"),
        ("Time", f"{req.check_in_time:%I:%M %p} – {req.check_out_time:%I:%M %p}"),
    ]


def regularization_submitted(req) -> None:
    # Their "you forgot to check out on …" nudge for that day is now dealt with.
    from django.utils import timezone

    from notifications.models import Notification

    Notification.objects.filter(recipient_id=req.user_id, kind="missed_checkout", dedupe_key=f"missed:{req.date}", read_at__isnull=True).update(
        read_at=timezone.now()
    )
    _inapp(
        _approvers(req),
        "request_submitted",
        f"{req.user.name} requested a {req.get_type_display().lower()}",
        body=f"{req.date:%a, %d %b}",
        link="/requests?tab=approvals",
        actor=req.user,
    )
    badge, bg, fg = BADGES["pending"]
    _send_each(
        _approvers(req),
        f"{req.get_type_display()} request from {req.user.name} ({req.date:%d %b})",
        {
            "company": req.company,
            "heading": f"{req.user.name} requested a {req.get_type_display().lower()}",
            "intro": "Approving it will update their attendance for that day.",
            "rows": _reg_rows(req),
            "quote": req.reason,
            "link": _url("/requests?tab=approvals"),
            "cta": "Review request",
            "badge": badge,
            "badge_bg": bg,
            "badge_fg": fg,
        },
    )


def regularization_decided(req) -> None:
    badge, bg, fg = BADGES[req.status]
    verb = "approved" if req.status == "approved" else "rejected"
    _inapp(
        [req.user],
        f"request_{verb}",
        f"Your {req.get_type_display().lower()} request was {verb}",
        body=f"{req.date:%a, %d %b} · by {req.decided_by.name}" + (f" · \"{req.decision_comment}\"" if req.decision_comment else ""),
        link="/requests",
        actor=req.decided_by,
    )
    _send_each(
        [req.user],
        f"Your {req.get_type_display().lower()} request was {verb}",
        {
            "company": req.company,
            "heading": f"Your {req.get_type_display().lower()} request was {verb}",
            "intro": "Your attendance for that day has been updated." if verb == "approved" else "Your attendance for that day is unchanged.",
            "rows": _reg_rows(req)[1:] + [("Decided by", req.decided_by.name)],
            "quote": req.decision_comment,
            "quote_label": "Comment",
            "link": _url("/attendance"),
            "cta": "View attendance",
            "badge": badge,
            "badge_bg": bg,
            "badge_fg": fg,
        },
    )
