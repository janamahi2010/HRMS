"""Company business logic: defaults, settings and the working-day calendar."""

from datetime import date, timedelta
from decimal import Decimal

from django.db import transaction

from .models import Company, CompanySettings, Holiday

DEFAULT_LEAVE_TYPES = [
    # name, yearly quota, half-day allowed, paid, color
    ("Casual Leave", Decimal("12"), True, True, "#4f46e5"),
    ("Sick Leave", Decimal("10"), True, True, "#0ea5e9"),
    ("Earned Leave", Decimal("15"), False, True, "#10b981"),
    ("Unpaid Leave", Decimal("0"), True, False, "#64748b"),
]


@transaction.atomic
def bootstrap_company(company: Company) -> CompanySettings:
    """Create per-company defaults right after signup. Idempotent."""
    from leaves.models import LeaveType  # local import: leaves depends on company

    settings_obj, _ = CompanySettings.objects.get_or_create(company=company)
    for name, quota, half, paid, color in DEFAULT_LEAVE_TYPES:
        LeaveType.objects.get_or_create(
            company=company,
            name=name,
            defaults={"yearly_quota": quota, "allow_half_day": half, "is_paid": paid, "color": color},
        )
    return settings_obj


def get_settings(company_id: int) -> CompanySettings:
    obj, _ = CompanySettings.objects.get_or_create(company_id=company_id)
    return obj


class WorkCalendar:
    """Answers "is this a working day?" for a company over a date range with a single query."""

    def __init__(self, company_id: int, start: date, end: date, settings_obj: CompanySettings | None = None):
        self.settings = settings_obj or get_settings(company_id)
        self.weekly_offs = set(self.settings.weekly_offs or [])
        self.holidays: dict[date, str] = dict(
            Holiday.objects.filter(company_id=company_id, date__range=(start, end)).values_list("date", "name")
        )

    def day_kind(self, d: date) -> str:
        """'holiday' | 'weekly_off' | 'working'. Holidays win over weekly offs."""
        if d in self.holidays:
            return "holiday"
        if d.weekday() in self.weekly_offs:
            return "weekly_off"
        return "working"

    def is_working(self, d: date) -> bool:
        return self.day_kind(d) == "working"

    def working_days(self, start: date, end: date) -> list[date]:
        out, d = [], start
        while d <= end:
            if self.is_working(d):
                out.append(d)
            d += timedelta(days=1)
        return out
