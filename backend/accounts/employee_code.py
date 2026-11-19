"""Employee ID numbers: EMP001, EMP002… for staff and INT001… for interns, per company.

Numbers are never reused within a prefix (we always take the highest + 1), and admins may
set a custom ID instead (unique within the company).
"""

import re

from core.constants import Role

PREFIX = {Role.INTERN: "INT"}
DEFAULT_PREFIX = "EMP"
WIDTH = 3


def prefix_for(role: str) -> str:
    return PREFIX.get(role, DEFAULT_PREFIX)


def next_code(company_id: int, role: str, exclude_user_id: int | None = None) -> str:
    """Highest existing number for this prefix + 1. Call inside a transaction that locks the company row."""
    from .models import User

    prefix = prefix_for(role)
    pattern = re.compile(rf"^{prefix}(\d+)$")
    qs = User.objects.filter(company_id=company_id, employee_code__startswith=prefix)
    if exclude_user_id:
        qs = qs.exclude(pk=exclude_user_id)
    highest = max((int(m.group(1)) for c in qs.values_list("employee_code", flat=True) if (m := pattern.match(c or ""))), default=0)
    return f"{prefix}{highest + 1:0{WIDTH}d}"


def is_auto_code(code: str, role: str) -> bool:
    """True if `code` looks like an automatic ID for `role` (so a role change may renumber it)."""
    return bool(re.fullmatch(rf"{prefix_for(role)}\d+", code or ""))


def lock_company(company_id: int):
    from company.models import Company

    return Company.objects.select_for_update().get(pk=company_id)
