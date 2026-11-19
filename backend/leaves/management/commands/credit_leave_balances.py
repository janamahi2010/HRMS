"""Credit yearly leave balances. Render Cron runs this on 1 January (00:05 IST):

    python manage.py credit_leave_balances            # current year
    python manage.py credit_leave_balances --year 2027

Idempotent: existing balances are never touched, so re-running is safe. People who join
during the year are credited pro-rata when they're created.
"""

from django.core.management.base import BaseCommand

from accounts.models import User
from attendance.services import today_ist
from leaves.services import credit_balances_for_user


class Command(BaseCommand):
    help = "Create this year's leave balances for every active user (idempotent)."

    def add_arguments(self, parser):
        parser.add_argument("--year", type=int, help="Defaults to the current year (IST).")
        parser.add_argument("--company", type=int, help="Only this company id.")

    def handle(self, *args, **opts):
        year = opts["year"] or today_ist().year
        users = User.objects.filter(is_active=True, company__isnull=False)
        if opts["company"]:
            users = users.filter(company_id=opts["company"])
        created = 0
        for u in users.iterator():
            created += len(credit_balances_for_user(u, year))
        self.stdout.write(self.style.SUCCESS(f"{year}: created {created} balance(s) for {users.count()} user(s)."))
