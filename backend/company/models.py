from datetime import time
from decimal import Decimal

from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

from core.models import TimeStampedModel


def default_weekly_offs() -> list[int]:
    return [5, 6]  # Saturday, Sunday (Monday=0 … Sunday=6, Python weekday())


class Company(TimeStampedModel):
    name = models.CharField(max_length=150)
    logo = models.ImageField(upload_to="company_logos/", blank=True, null=True)
    # Optional artwork for birthday cards on the Home page; a built-in design is used when empty.
    birthday_poster = models.ImageField(upload_to="birthday_posters/", blank=True, null=True)

    class Meta:
        verbose_name_plural = "companies"
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name


class CompanySettings(TimeStampedModel):
    """Per-company attendance rules. Created automatically with the company."""

    company = models.OneToOneField(Company, on_delete=models.CASCADE, related_name="settings")
    office_start = models.TimeField(default=time(9, 30))
    office_end = models.TimeField(default=time(18, 30))
    late_after = models.TimeField(default=time(9, 45), help_text="Check-ins after this time are marked Late.")
    half_day_hours = models.DecimalField(
        max_digits=4,
        decimal_places=2,
        default=Decimal("4.5"),
        validators=[MinValueValidator(Decimal("0.5")), MaxValueValidator(Decimal("24"))],
        help_text="Minimum worked hours for a full day; less than this is a Half-day.",
    )
    weekly_offs = models.JSONField(default=default_weekly_offs, help_text="Weekday numbers: Mon=0 … Sun=6")
    work_summary_required = models.BooleanField(
        default=False, help_text="Employees must describe their day's work before they can check out."
    )
    attendance_start = models.DateField(
        null=True,
        blank=True,
        help_text="Days before this are never counted as Absent (the team didn't use HRMS yet). "
        "Joining dates stay as they are.",
    )
    default_cc = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        blank=True,
        related_name="default_cc_for",
        help_text="Added as CC on every leave request.",
    )
    backup_approver = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
        help_text="When someone's reporting manager is on leave, their new requests go to this admin instead.",
    )

    class Meta:
        verbose_name = "company settings"
        verbose_name_plural = "company settings"

    def __str__(self) -> str:
        return f"Settings for {self.company}"

    @property
    def half_day_minutes(self) -> int:
        return int(self.half_day_hours * 60)


class OfficeLocation(TimeStampedModel):
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="locations")
    name = models.CharField(max_length=100)
    address = models.CharField(max_length=255, blank=True)
    latitude = models.DecimalField(
        max_digits=9, decimal_places=6, validators=[MinValueValidator(-90), MaxValueValidator(90)]
    )
    longitude = models.DecimalField(
        max_digits=9, decimal_places=6, validators=[MinValueValidator(-180), MaxValueValidator(180)]
    )
    radius_m = models.PositiveIntegerField(
        default=100, validators=[MinValueValidator(20), MaxValueValidator(5000)]
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]
        indexes = [models.Index(fields=["company", "is_active"])]
        constraints = [
            models.UniqueConstraint(fields=["company", "name"], name="uniq_location_name_per_company")
        ]

    def __str__(self) -> str:
        return f"{self.name} ({self.company})"


class Holiday(TimeStampedModel):
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="holidays")
    date = models.DateField()
    name = models.CharField(max_length=100)

    class Meta:
        ordering = ["date"]
        indexes = [models.Index(fields=["company", "date"])]
        constraints = [models.UniqueConstraint(fields=["company", "date"], name="uniq_holiday_per_day")]

    def __str__(self) -> str:
        return f"{self.name} ({self.date})"
