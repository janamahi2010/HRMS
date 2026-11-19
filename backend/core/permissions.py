"""Role-based permission classes.

Permissions answer "may this role call this endpoint at all?".
Row-level access is enforced separately by queryset scoping (see core.scoping),
so guessing another object's ID always yields 404.
"""

from rest_framework.permissions import SAFE_METHODS, BasePermission

from .constants import Role


class IsAdmin(BasePermission):
    message = "Only admins can perform this action."

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.role == Role.ADMIN)


class IsManagerOrAdmin(BasePermission):
    message = "Only managers and admins can perform this action."

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role in (Role.ADMIN, Role.MANAGER)
        )


class IsAdminOrReadOnly(BasePermission):
    message = "Only admins can modify this resource."

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        return request.method in SAFE_METHODS or request.user.role == Role.ADMIN
