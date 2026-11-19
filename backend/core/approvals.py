"""Approval routing shared by leave and regularization requests.

Rules
- Employee  -> their reporting manager (if active), otherwise the admin pool.
- Manager / Admin -> an admin: their own manager if that person is an active admin,
  otherwise the admin pool.
- `approver=None` means "any admin of the company".
- Admins may decide any request in their company (override), but never their own
  unless they are the only active admin.
"""

from .constants import INDIVIDUAL_ROLES, RequestStatus, Role


def resolve_approver(user):
    mgr = user.manager
    if mgr is None or not mgr.is_active or mgr.company_id != user.company_id:
        return None
    if user.role in INDIVIDUAL_ROLES:
        return _cover_if_away(user, mgr)
    return _cover_if_away(user, mgr) if mgr.role == Role.ADMIN else None


def _cover_if_away(user, approver):
    """The company's backup approver stands in while the approver is on approved leave today."""
    from attendance.services import today_ist
    from company.services import get_settings
    from leaves.models import LeaveRequest

    today = today_ist()
    away = LeaveRequest.objects.filter(
        user=approver, status=RequestStatus.APPROVED, from_date__lte=today, to_date__gte=today
    ).exists()
    if not away:
        return approver
    backup = get_settings(user.company_id).backup_approver
    if backup and backup.is_active and backup.id not in (user.id, approver.id):
        return backup
    return approver


def can_decide(actor, request_obj) -> bool:
    if actor.company_id != request_obj.company_id or request_obj.status != RequestStatus.PENDING:
        return False
    if actor.role == Role.ADMIN:
        if request_obj.user_id != actor.id:
            return True
        from accounts.models import User

        other_admins = (
            User.objects.filter(company_id=actor.company_id, role=Role.ADMIN, is_active=True)
            .exclude(pk=actor.pk)
            .exists()
        )
        return not other_admins
    if actor.role == Role.MANAGER:
        return request_obj.approver_id == actor.id and request_obj.user_id != actor.id
    return False


def decidable_q(actor):
    """Q selecting pending requests `actor` may approve/reject (mirrors can_decide, for querysets)."""
    from django.db.models import Q

    from accounts.models import User

    q = Q(company_id=actor.company_id, status=RequestStatus.PENDING)
    if actor.role == Role.ADMIN:
        sole_admin = not (
            User.objects.filter(company_id=actor.company_id, role=Role.ADMIN, is_active=True).exclude(pk=actor.pk).exists()
        )
        return q if sole_admin else q & ~Q(user_id=actor.id)
    if actor.role == Role.MANAGER:
        return q & Q(approver_id=actor.id) & ~Q(user_id=actor.id)
    return Q(pk__in=[])
