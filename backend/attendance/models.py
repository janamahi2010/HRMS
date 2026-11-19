from django.conf import settings
from django.db import models

from core.models import TimeStampedModel


class AttendanceStatus(models.TextChoices):
    PRESENT = "present", "Present"
    LATE = "late", "Late"
    HALF_DAY = "half_day", "Half-day"
    ABSENT = "absent", "Absent"
    ON_LEAVE = "on_leave", "On leave"
    HOLIDAY = "holiday", "Holiday"
    WEEKLY_OFF = "weekly_off", "Weekly off"
    INCOMPLETE = "incomplete", "Incomplete"  # checked in, never checked out


class AttendanceSource(models.TextChoices):
    GPS = "gps", "GPS punch"
    REMOTE = "remote", "Remote"
    REGULARIZATION = "regularization", "Regularization"
    SYSTEM = "system", "System"  # created by close_attendance_day


class Attendance(TimeStampedModel):
    """One row per user per calendar day (IST). All punch times are server time."""

    company = models.ForeignKey("company.Company", on_delete=models.CASCADE, related_name="attendance")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="attendance")
    date = models.DateField()
    status = models.CharField(max_length=12, choices=AttendanceStatus.choices)
    source = models.CharField(max_length=16, choices=AttendanceSource.choices, default=AttendanceSource.GPS)

    check_in_at = models.DateTimeField(null=True, blank=True)
    check_in_lat = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    check_in_lng = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    check_in_accuracy_m = models.FloatField(null=True, blank=True)
    check_in_distance_m = models.FloatField(null=True, blank=True)
    check_in_ip = models.GenericIPAddressField(null=True, blank=True)
    check_in_user_agent = models.CharField(max_length=255, blank=True)

    check_out_at = models.DateTimeField(null=True, blank=True)
    check_out_lat = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    check_out_lng = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    check_out_accuracy_m = models.FloatField(null=True, blank=True)
    check_out_distance_m = models.FloatField(null=True, blank=True)
    check_out_ip = models.GenericIPAddressField(null=True, blank=True)
    check_out_user_agent = models.CharField(max_length=255, blank=True)

    office_location = models.ForeignKey(
        "company.OfficeLocation", on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    worked_minutes = models.PositiveIntegerField(default=0)
    is_late = models.BooleanField(default=False)
    remarks = models.CharField(max_length=255, blank=True)
    # What the employee worked on that day (daily work log / EOD report). Plain text.
    work_summary = models.TextField(max_length=2000, blank=True)
    work_summary_updated_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-date"]
        constraints = [models.UniqueConstraint(fields=["user", "date"], name="uniq_attendance_user_date")]
        indexes = [
            models.Index(fields=["company", "date"]),
            models.Index(fields=["company", "date", "status"]),
            models.Index(fields=["user", "-date"]),
        ]
        verbose_name_plural = "attendance"

    def __str__(self) -> str:
        return f"{self.user_id} {self.date} {self.status}"
