from decimal import Decimal

from django.conf import settings
from django.core.validators import MinValueValidator, RegexValidator
from django.db import models

from core.constants import RequestStatus
from core.models import TimeStampedModel

hex_color = RegexValidator(r"^#[0-9a-fA-F]{6}$", "Use a hex color like #4f46e5.")


class Accrual(models.TextChoices):
    YEARLY = "yearly", "Yearly (all on 1 January)"
    MONTHLY = "monthly", "Monthly (1/12 on the 1st of each month)"


class LeaveType(TimeStampedModel):
    company = models.ForeignKey("company.Company", on_delete=models.CASCADE, related_name="leave_types")
    name = models.CharField(max_length=50)
    yearly_quota = models.DecimalField(
        max_digits=5, decimal_places=1, default=Decimal("0"), validators=[MinValueValidator(0)]
    )
    allow_half_day = models.BooleanField(default=True)
    is_paid = models.BooleanField(default=True, help_text="Unpaid leave skips balance checks.")
    color = models.CharField(max_length=7, default="#4f46e5", validators=[hex_color])
    is_active = models.BooleanField(default=True)
    accrual = models.CharField(max_length=10, choices=Accrual.choices, default=Accrual.YEARLY)
    # System type used only by interns: plain "Leave" (no paid / casual / sick). Hidden from settings and
    # from everyone else; its count goes up when a request is approved (not when applied).
    for_interns = models.BooleanField(default=False, editable=False)

    class Meta:
        ordering = ["name"]
        indexes = [models.Index(fields=["company", "is_active"])]
        constraints = [models.UniqueConstraint(fields=["company", "name"], name="uniq_leave_type_name")]

    def __str__(self) -> str:
        return self.name


class LeaveBalance(TimeStampedModel):
    company = models.ForeignKey("company.Company", on_delete=models.CASCADE, related_name="+")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="leave_balances")
    leave_type = models.ForeignKey(LeaveType, on_delete=models.CASCADE, related_name="balances")
    year = models.PositiveSmallIntegerField()
    total = models.DecimalField(max_digits=5, decimal_places=1, default=Decimal("0"))
    used = models.DecimalField(max_digits=5, decimal_places=1, default=Decimal("0"))
    # Monthly types: how many months of the year have been credited into `total` so far.
    credited_months = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["leave_type__name"]
        constraints = [
            models.UniqueConstraint(fields=["user", "leave_type", "year"], name="uniq_balance_user_type_year")
        ]
        indexes = [models.Index(fields=["company", "year"]), models.Index(fields=["user", "year"])]

    def __str__(self) -> str:
        return f"{self.user_id} {self.leave_type} {self.year}: {self.used}/{self.total}"

    @property
    def available(self) -> Decimal:
        return self.total - self.used


class HalfDaySession(models.TextChoices):
    FIRST = "first", "First half"
    SECOND = "second", "Second half"


class LeaveRequest(TimeStampedModel):
    company = models.ForeignKey("company.Company", on_delete=models.CASCADE, related_name="leave_requests")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="leave_requests")
    leave_type = models.ForeignKey(LeaveType, on_delete=models.PROTECT, related_name="requests")
    from_date = models.DateField()
    to_date = models.DateField()
    is_half_day = models.BooleanField(default=False)
    half = models.CharField(max_length=6, choices=HalfDaySession.choices, blank=True)
    days = models.DecimalField(max_digits=5, decimal_places=1)
    reason = models.TextField(max_length=1000)
    status = models.CharField(max_length=10, choices=RequestStatus.choices, default=RequestStatus.PENDING)
    # Null approver = routed to the company's admins (e.g. a manager's own request).
    approver = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    decided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    decision_comment = models.CharField(max_length=500, blank=True)
    decided_at = models.DateTimeField(null=True, blank=True)
    cc_users = models.ManyToManyField(
        settings.AUTH_USER_MODEL, through="LeaveRequestCC", related_name="cc_leave_requests", blank=True
    )

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["company", "status"]),
            models.Index(fields=["company", "from_date", "to_date"]),
            models.Index(fields=["user", "-from_date"]),
            models.Index(fields=["approver", "status"]),
        ]
        constraints = [
            models.CheckConstraint(condition=models.Q(to_date__gte=models.F("from_date")), name="leave_dates_ordered"),
        ]

    def __str__(self) -> str:
        return f"{self.user_id} {self.leave_type} {self.from_date}→{self.to_date} ({self.status})"


class LeaveRequestCC(TimeStampedModel):
    request = models.ForeignKey(LeaveRequest, on_delete=models.CASCADE, related_name="cc_entries")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="+")

    class Meta:
        constraints = [models.UniqueConstraint(fields=["request", "user"], name="uniq_leave_cc")]
        indexes = [models.Index(fields=["user"])]
        verbose_name = "leave request CC"

    def __str__(self) -> str:
        return f"CC {self.user_id} on {self.request_id}"
