"""Queryset scoping helpers: the backbone of multi-tenant data isolation.

Every list/detail endpoint builds its queryset through one of these, so an object
outside the caller's scope simply doesn't exist for them (404, never 403 leaks).
"""

from django.db.models import Q, QuerySet

from .constants import Role


def visible_user_q(user, prefix: str = "user") -> Q:
    """Q filter selecting rows whose `<prefix>` the given user may see.

    Admin    -> anyone in the company
    Manager  -> self + direct reports
    Employee -> self only
    Always restricted to the user's company.
    """
    p = f"{prefix}__" if prefix else ""
    q = Q(**{f"{p}company_id": user.company_id})
    if user.role == Role.ADMIN:
        return q
    if user.role == Role.MANAGER:
        return q & (Q(**{f"{p}id": user.id}) | Q(**{f"{p}manager_id": user.id}))
    return q & Q(**{f"{p}id": user.id})


def visible_users(user) -> QuerySet:
    from accounts.models import User

    return User.objects.filter(visible_user_q(user, prefix=""))


class CompanyScopedMixin:
    """For ViewSets over company-wide models (locations, holidays, leave types):
    restrict to the caller's company and stamp company on create."""

    company_field = "company"

    def get_queryset(self) -> QuerySet:
        qs = super().get_queryset()
        return qs.filter(**{f"{self.company_field}_id": self.request.user.company_id})

    def perform_create(self, serializer):
        serializer.save(**{self.company_field: self.request.user.company})


class UserScopedMixin:
    """For ViewSets over per-user data (attendance, requests, balances):
    restrict to rows whose owner the caller may see."""

    user_field = "user"

    def get_queryset(self) -> QuerySet:
        qs = super().get_queryset()
        return qs.filter(visible_user_q(self.request.user, prefix=self.user_field))
