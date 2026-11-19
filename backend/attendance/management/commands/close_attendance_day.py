"""Finalise a day's attendance. Render Cron runs this at 23:55 IST:

    python manage.py close_attendance_day             # today (IST)
    python manage.py close_attendance_day --date 2026-11-09
    python manage.py close_attendance_day --backfill 7   # re-run the last 7 days (idempotent)
"""

from datetime import date, timedelta

from django.core.management.base import BaseCommand, CommandError

from attendance.services import close_day, today_ist


class Command(BaseCommand):
    help = "Mark Absent / On leave / Incomplete for a day. Idempotent."

    def add_arguments(self, parser):
        parser.add_argument("--date", help="YYYY-MM-DD (default: today in IST)")
        parser.add_argument("--backfill", type=int, default=0, help="Also close the N days before --date.")
        parser.add_argument("--company", type=int, help="Only this company id.")

    def handle(self, *args, **opts):
        try:
            end = date.fromisoformat(opts["date"]) if opts["date"] else today_ist()
        except ValueError as e:
            raise CommandError("--date must be YYYY-MM-DD") from e
        if end > today_ist():
            raise CommandError("Can't close a future date.")

        for i in range(opts["backfill"], -1, -1):
            d = end - timedelta(days=i)
            counts = close_day(d, company_id=opts["company"])
            self.stdout.write(
                f"{d}: absent={counts['absent']} on_leave={counts['on_leave']} incomplete={counts['incomplete']}"
            )
        # Monthly leave types: credit this month's share for everyone (also happens lazily on use).
        from leaves.services import top_up_monthly

        self.stdout.write(f"monthly leave top-ups: {top_up_monthly(company_id=opts['company'])}")
        self.stdout.write(self.style.SUCCESS("Done."))
