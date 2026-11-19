"""In-app notifications (the bell): one row per recipient."""

from django.db import models
from django.db.models import Q

from core.models import TimeStampedModel


class Notification(TimeStampedModel):
    class Kind(models.TextChoices):
        LEAVE_APPLIED = "leave_applied", "Leave to approve"
        LEAVE_APPROVED = "leave_approved", "Leave approved"
        LEAVE_REJECTED = "leave_rejected", "Leave rejected"
        LEAVE_CANCELLED = "leave_cancelled", "Leave cancelled"
        LEAVE_CC = "leave_cc", "Leave (CC)"
        REQUEST_SUBMITTED = "request_submitted", "Request to approve"
        REQUEST_APPROVED = "request_approved", "Request approved"
        REQUEST_REJECTED = "request_rejected", "Request rejected"
        NEWS = "news", "Company news"
        BIRTHDAY = "birthday", "Birthday"
        BIRTHDAY_SELF = "birthday_self", "Your birthday"
        BIRTHDAY_WISH = "birthday_wish", "Birthday wish"
        CHECKOUT_REMINDER = "checkout_reminder", "Check-out reminder"
        MISSED_CHECKOUT = "missed_checkout", "Missed check-out"

    company = models.ForeignKey("company.Company", on_delete=models.CASCADE, related_name="+")
    recipient = models.ForeignKey("accounts.User", on_delete=models.CASCADE, related_name="notifications")
    actor = models.ForeignKey("accounts.User", on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    kind = models.CharField(max_length=30, choices=Kind.choices)
    title = models.CharField(max_length=200)
    body = models.CharField(max_length=300, blank=True)
    link = models.CharField(max_length=200, blank=True)  # in-app path, e.g. /leave?tab=approvals
    # Stops duplicates for generated notifications (e.g. one birthday notice per person per day).
    dedupe_key = models.CharField(max_length=80, blank=True, default="")
    read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["recipient", "-created_at"]),
            models.Index(fields=["recipient", "read_at"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["recipient", "dedupe_key"], condition=~Q(dedupe_key=""), name="uniq_notification_dedupe"
            )
        ]

    def __str__(self) -> str:
        return f"{self.recipient_id}: {self.title}"
