"""Remind people who are still checked in 30 minutes after their shift ended. Render Cron runs it every
30 minutes in the evening; it's idempotent (one reminder per person per day).

    python manage.py send_checkout_reminders
"""

from django.core.management.base import BaseCommand

from accounts.models import User
from attendance.models import Attendance
from attendance.services import today_ist
from notifications.services import checkout_reminder


class Command(BaseCommand):
    help = "In-app reminder for anyone who hasn't checked out yet."

    def handle(self, *args, **opts):
        ids = Attendance.objects.filter(date=today_ist(), check_in_at__isnull=False, check_out_at__isnull=True).values_list("user_id", flat=True)
        sent = sum(checkout_reminder(u) for u in User.objects.filter(id__in=ids, is_active=True))
        self.stdout.write(self.style.SUCCESS(f"Reminders sent: {sent}"))
