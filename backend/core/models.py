from django.conf import settings
from django.db import models


class TimeStampedModel(models.Model):
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class AuditLog(TimeStampedModel):
    """Append-only record of sensitive actions (balance adjustments, role changes, deactivations…)."""

    class Action(models.TextChoices):
        LEAVE_BALANCE_ADJUSTED = "leave_balance_adjusted", "Leave balance adjusted"
        USER_CREATED = "user_created", "User created"
        USER_UPDATED = "user_updated", "User updated"
        USER_DEACTIVATED = "user_deactivated", "User deactivated"
        USER_ACTIVATED = "user_activated", "User activated"
        SETTINGS_UPDATED = "settings_updated", "Settings updated"
        ATTENDANCE_REGULARIZED = "attendance_regularized", "Attendance regularized"
        PASSWORD_SET_BY_ADMIN = "password_set_by_admin", "Password set by admin"

    company = models.ForeignKey("company.Company", on_delete=models.CASCADE, related_name="audit_logs")
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    target_user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    action = models.CharField(max_length=40, choices=Action.choices)
    message = models.CharField(max_length=255, blank=True)
    data = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["company", "-created_at"]),
            models.Index(fields=["company", "action"]),
            models.Index(fields=["target_user"]),
        ]

    def __str__(self) -> str:
        return f"{self.get_action_display()} @ {self.created_at:%Y-%m-%d %H:%M}"


def audit(*, company, action, actor=None, target_user=None, message="", data=None) -> AuditLog:
    return AuditLog.objects.create(
        company=company, actor=actor, target_user=target_user, action=action, message=message, data=data or {}
    )
