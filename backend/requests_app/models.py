from django.conf import settings
from django.db import models

from core.constants import RequestStatus
from core.models import TimeStampedModel


class RegularizationType(models.TextChoices):
    MISSED_PUNCH = "missed_punch", "Missed punch"
    WORK_FROM_HOME = "wfh", "Work from home"
    CLIENT_VISIT = "client_visit", "Client visit"


class RegularizationRequest(TimeStampedModel):
    company = models.ForeignKey("company.Company", on_delete=models.CASCADE, related_name="regularizations")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="regularizations")
    date = models.DateField()
    type = models.CharField(max_length=16, choices=RegularizationType.choices)
    check_in_time = models.TimeField()
    check_out_time = models.TimeField()
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

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["company", "status"]),
            models.Index(fields=["user", "-date"]),
            models.Index(fields=["approver", "status"]),
        ]

    def __str__(self) -> str:
        return f"{self.get_type_display()} {self.date} ({self.status})"
