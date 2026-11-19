"""Account business logic: signup, invites, password reset."""

from django.conf import settings
from django.contrib.auth.tokens import default_token_generator
from django.db import transaction
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from rest_framework_simplejwt.token_blacklist.models import OutstandingToken
from rest_framework_simplejwt.tokens import RefreshToken

from company.models import Company
from core.constants import Role
from core.email import send_email_async
from core.exceptions import ServiceError

from .models import User


def issue_tokens(user: User) -> dict:
    refresh = RefreshToken.for_user(user)
    return {"access": str(refresh.access_token), "refresh": str(refresh)}


def revoke_all_tokens(user: User) -> None:
    """Sign the user out everywhere, immediately (no refresh grace window)."""
    from .tokens import revoke_outstanding

    revoke_outstanding(OutstandingToken.objects.filter(user=user))


@transaction.atomic
def signup_company(*, company_name: str, name: str, email: str, password: str) -> User:
    if User.objects.filter(email__iexact=email).exists():
        raise ServiceError("An account with this email already exists.", code="email_taken")
    company = Company.objects.create(name=company_name.strip())
    user = User.objects.create_user(
        email=email,
        password=password,
        name=name.strip(),
        role=Role.ADMIN,
        employee_code="EMP001",
        company=company,
    )
    from company.services import bootstrap_company  # local import avoids app-loading cycles

    bootstrap_company(company)
    return user


# ---------------------------------------------------------------------------
# Password links (used for both reset and invite)
# ---------------------------------------------------------------------------
def build_password_link(user: User, path: str) -> str:
    uid = urlsafe_base64_encode(force_bytes(user.pk))
    token = default_token_generator.make_token(user)
    return f"{settings.FRONTEND_URL}/{path}?uid={uid}&token={token}"


def get_user_from_token(uid: str, token: str) -> User:
    try:
        pk = force_str(urlsafe_base64_decode(uid))
        user = User.objects.select_related("company").get(pk=pk, is_active=True)
    except (ValueError, TypeError, OverflowError, User.DoesNotExist):
        user = None
    if user is None or not default_token_generator.check_token(user, token):
        raise ServiceError(
            "This link is invalid or has expired. Please request a new one.", code="invalid_token"
        )
    return user


def request_password_reset(email: str) -> None:
    """Always succeeds silently so attackers cannot enumerate accounts."""
    user = (
        User.objects.select_related("company")
        .filter(email__iexact=email.strip(), is_active=True, company__isnull=False)
        .first()
    )
    if not user:
        return
    send_email_async(
        subject="Reset your password",
        template="emails/password_reset.html",
        context={
            "user": user,
            "company": user.company,
            "link": build_password_link(user, "reset-password"),
        },
        to=[user.email],
    )


def send_invite(user: User, invited_by: User | None = None) -> None:
    send_email_async(
        subject=f"You're invited to join {user.company.name} on HRMS",
        template="emails/invite.html",
        context={
            "user": user,
            "company": user.company,
            "invited_by": invited_by,
            "link": build_password_link(user, "set-password"),
        },
        to=[user.email],
    )


# ---------------------------------------------------------------------------
# Employee management (admin)
# ---------------------------------------------------------------------------
TRACKED_FIELDS = (
    "name", "email", "phone", "designation", "role", "manager_id", "office_location_id", "joining_date",
    "date_of_birth", "show_birthday", "internship_start", "internship_end", "employee_code", "remote_allowed",
)


@transaction.atomic
def create_employee(
    *, actor: User, data: dict, send_invite_email: bool = True, password: str | None = None, must_change_password: bool = True
) -> User:
    from django.utils import timezone

    from core.models import AuditLog, audit
    from leaves.services import credit_balances_for_user

    from .employee_code import lock_company, next_code

    lock_company(actor.company_id)  # serialise ID numbering
    if not data.get("employee_code"):
        data["employee_code"] = next_code(actor.company_id, data.get("role", Role.EMPLOYEE))
    # With an admin-chosen password the account is ready immediately (no invite needed).
    user = User.objects.create_user(
        company=actor.company, password=password or None, must_change_password=bool(password) and must_change_password, **data
    )
    credit_balances_for_user(user, timezone.localdate().year, prorate=True)
    audit(
        company=actor.company,
        actor=actor,
        target_user=user,
        action=AuditLog.Action.USER_CREATED,
        message=f"Added {user.name} as {user.get_role_display()}" + (" with a password set by an admin" if password else ""),
    )
    if send_invite_email and not password:
        send_invite(user, invited_by=actor)
    return user


@transaction.atomic
def update_employee(*, actor: User, user: User, data: dict) -> User:
    from core.models import AuditLog, audit

    before = {f: getattr(user, f) for f in TRACKED_FIELDS}
    old_code = user.employee_code
    for key, value in data.items():
        setattr(user, key, value)
    # Intern <-> staff with an automatic ID: give them the next number in the new series (INT -> EMP).
    from .employee_code import is_auto_code, lock_company, next_code

    if before["role"] != user.role and "employee_code" not in data and is_auto_code(old_code, before["role"]):
        lock_company(user.company_id)
        new_code = next_code(user.company_id, user.role, exclude_user_id=user.pk)
        if not is_auto_code(old_code, user.role):
            user.employee_code = new_code
    user.save()
    if before["role"] != user.role:
        from leaves.services import rebalance_for_role_change

        rebalance_for_role_change(user, before["role"], user.role)
    private = {"date_of_birth"}  # record that it changed, not the value
    changes = {
        f: (["(changed)", "(changed)"] if f in private else [str(before[f]), str(getattr(user, f))])
        for f in TRACKED_FIELDS
        if before[f] != getattr(user, f)
    }
    if changes:
        audit(
            company=actor.company,
            actor=actor,
            target_user=user,
            action=AuditLog.Action.USER_UPDATED,
            message=f"Updated {user.name}: {', '.join(changes)}",
            data=changes,
        )
    return user


@transaction.atomic
def set_active(*, actor: User, user: User, active: bool) -> User:
    from core.models import AuditLog, audit

    if user.pk == actor.pk:
        raise ServiceError("You can't deactivate your own account.", code="self_deactivate")
    if user.is_active == active:
        return user
    user.is_active = active
    user.save(update_fields=["is_active", "updated_at"])
    if not active:
        revoke_all_tokens(user)  # kick them out everywhere immediately
    audit(
        company=actor.company,
        actor=actor,
        target_user=user,
        action=AuditLog.Action.USER_ACTIVATED if active else AuditLog.Action.USER_DEACTIVATED,
        message=f"{'Activated' if active else 'Deactivated'} {user.name}",
    )
    return user


@transaction.atomic
@transaction.atomic
def admin_set_password(*, actor: User, user: User, password: str, must_change: bool = True) -> User:
    """Admin chooses a password for someone (no email needed). Signs them out everywhere."""
    from core.models import AuditLog, audit

    if user.pk == actor.pk:
        raise ServiceError("Change your own password from My profile.", code="self_password")
    user.set_password(password)
    user.must_change_password = must_change
    user.save(update_fields=["password", "must_change_password", "updated_at"])
    revoke_all_tokens(user)
    audit(
        company=actor.company,
        actor=actor,
        target_user=user,
        action=AuditLog.Action.PASSWORD_SET_BY_ADMIN,
        message=f"Password set by {actor.name}" + (" (must change at next sign-in)" if must_change else ""),
    )
    return user


def reset_password(*, uid: str, token: str, password: str) -> User:
    user = get_user_from_token(uid, token)
    user.set_password(password)
    user.must_change_password = False  # they chose it themselves
    user.save(update_fields=["password", "must_change_password", "updated_at"])
    revoke_all_tokens(user)  # log out every other session
    return user
