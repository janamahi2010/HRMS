"""Create a realistic demo company.

    python manage.py seed_demo           # create (no-op if it already exists)
    python manage.py seed_demo --reset   # wipe and recreate the demo company

All demo users share the password printed at the end.
"""

import random
from datetime import date, time, timedelta
from decimal import Decimal

from django.contrib.auth.hashers import make_password
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from accounts.models import User
from attendance.models import Attendance, AttendanceSource, AttendanceStatus
from attendance.services import IST, combine_ist, derive_status, is_late, worked_minutes
from company.models import Company, Holiday, OfficeLocation
from company.services import WorkCalendar, bootstrap_company
from core.constants import RequestStatus, Role
from leaves.models import LeaveRequest, LeaveRequestCC, LeaveType
from leaves.services import count_leave_days, credit_balances_for_user, deduct_balance
from requests_app.models import RegularizationRequest, RegularizationType

DEMO_COMPANY = "Acme Demo"
DEMO_DOMAIN = "demo.hrms"
PASSWORD = "Demo@12345"
HISTORY_DAYS = 45

OFFICE = {"lat": Decimal("12.935200"), "lng": Decimal("77.624500"), "radius": 150}

PEOPLE = [
    # key, name, designation, role, manager key, joined (y, m, d)
    ("admin", "Aarav Mehta", "Founder & CEO", Role.ADMIN, None, (2021, 4, 1)),
    ("priya", "Priya Sharma", "Engineering Manager", Role.MANAGER, "admin", (2022, 1, 10)),
    ("rohan", "Rohan Verma", "Sales Manager", Role.MANAGER, "admin", (2022, 6, 1)),
    ("ananya", "Ananya Iyer", "Frontend Engineer", Role.EMPLOYEE, "priya", (2023, 2, 1)),
    ("karan", "Karan Singh", "Backend Engineer", Role.EMPLOYEE, "priya", (2023, 7, 17)),
    ("neha", "Neha Gupta", "QA Engineer", Role.EMPLOYEE, "priya", (2024, 1, 8)),
    ("vikram", "Vikram Rao", "DevOps Engineer", Role.EMPLOYEE, "priya", (2024, 9, 2)),
    ("sneha", "Sneha Patel", "Account Executive", Role.EMPLOYEE, "rohan", (2023, 3, 13)),
    ("arjun", "Arjun Nair", "Sales Associate", Role.EMPLOYEE, "rohan", (2024, 5, 20)),
    ("meera", "Meera Joshi", "Marketing Specialist", Role.EMPLOYEE, "rohan", (2023, 11, 1)),
    ("rahul", "Rahul Das", "Customer Success Associate", Role.EMPLOYEE, "rohan", None),  # joins this year
]

FIXED_HOLIDAYS = [
    ((1, 1), "New Year's Day"),
    ((1, 26), "Republic Day"),
    ((5, 1), "Labour Day"),
    ((8, 15), "Independence Day"),
    ((10, 2), "Gandhi Jayanti"),
    ((12, 25), "Christmas"),
]


WORK_NOTES = {
    "engineering": [
        "Fixed the login redirect bug (#142) and added a regression test",
        "Code review for the leave report PR; paired with Rahul on API pagination",
        "Built the Excel export for attendance; demo to Priya at 4 PM",
        "Investigated slow dashboard query, added an index, 3x faster",
        "Sprint planning, then refactored the check-in card",
        "Wrote API docs for the regularization endpoints",
        "Upgraded dependencies and fixed two breaking changes",
    ],
    "sales": [
        "Client call with Infinity Retail: shared pricing, follow-up on Friday",
        "Prepared proposal deck for Nova Labs; sent to Rohan for review",
        "Updated CRM pipeline, 4 deals moved to negotiation",
        "Demo for Greenleaf Foods; they want a trial for 20 users",
        "Cold outreach to 25 leads in Whitefield, 3 meetings booked",
    ],
    "general": [
        "Team stand-up, cleared the support queue (12 tickets)",
        "Monthly reporting for management; reconciled leave balances",
        "Interviews for the QA role, shared feedback with the panel",
        "Vendor meeting and office admin work",
    ],
}


def work_note(user, rnd) -> str:
    title = (user.designation or "").lower()
    if any(k in title for k in ("engineer", "devops", "qa", "frontend", "backend")):
        pool = WORK_NOTES["engineering"]
    elif any(k in title for k in ("sales", "account", "customer")):
        pool = WORK_NOTES["sales"]
    else:
        pool = WORK_NOTES["general"]
    picks = rnd.sample(pool, k=2 if rnd.random() < 0.5 else 1)
    return "\n".join(f"• {p}" for p in picks)


class Command(BaseCommand):
    help = "Seed a demo company with users, attendance, leaves and requests."

    def add_arguments(self, parser):
        parser.add_argument("--reset", action="store_true", help="Delete and recreate the demo company.")

    def handle(self, *args, reset=False, **opts):
        # Find the demo company by its admin, not its name: it may have been renamed in Settings.
        admin = User.objects.filter(email=f"admin@{DEMO_DOMAIN}").select_related("company").first()
        existing = (admin.company if admin and admin.company else None) or Company.objects.filter(name=DEMO_COMPANY).first()
        if existing and not reset:
            self.stdout.write(self.style.WARNING("Demo company already exists. Use --reset to recreate it."))
            return
        if existing:
            self._delete(existing)
        with transaction.atomic():
            self._seed()
        self.stdout.write(self.style.SUCCESS("Demo data ready."))
        self.stdout.write(f"  Admin:    admin@{DEMO_DOMAIN}")
        self.stdout.write(f"  Manager:  priya@{DEMO_DOMAIN}  /  rohan@{DEMO_DOMAIN}")
        self.stdout.write(f"  Employee: ananya@{DEMO_DOMAIN}  (and karan, neha, vikram, sneha, arjun, meera, rahul)")
        self.stdout.write(f"  Password: {PASSWORD}")

    # ------------------------------------------------------------------
    @transaction.atomic
    def _delete(self, company):
        LeaveRequest.objects.filter(company=company).delete()  # PROTECT on leave_type
        company.delete()
        User.objects.filter(email__endswith=f"@{DEMO_DOMAIN}").delete()
        self.stdout.write("Deleted existing demo company.")

    def _seed(self):
        rnd = random.Random(42)
        today = timezone.localdate()
        start = today - timedelta(days=HISTORY_DAYS)

        company = Company.objects.create(name=DEMO_COMPANY)
        cfg = bootstrap_company(company)
        office = OfficeLocation.objects.create(
            company=company,
            name="Head Office",
            address="80 Feet Road, Koramangala, Bengaluru 560034",
            latitude=OFFICE["lat"],
            longitude=OFFICE["lng"],
            radius_m=OFFICE["radius"],
        )
        for year in {start.year, today.year, today.year + 1}:
            for (m, d), name in FIXED_HOLIDAYS:
                Holiday.objects.get_or_create(company=company, date=date(year, m, d), defaults={"name": name})

        # --- Users -------------------------------------------------------
        users: dict[str, User] = {}
        password_hash = make_password(PASSWORD)  # hash once; PBKDF2 is deliberately slow
        # IDs in joining order, like the backfill for real companies (EMP001 = earliest joiner).
        order = sorted(PEOPLE, key=lambda p: p[5] or (today.year, 12, 31))
        codes = {p[0]: f"EMP{i:03d}" for i, p in enumerate(order, start=1)}
        for key, name, designation, role, mgr_key, joined in PEOPLE:
            joining = date(*joined) if joined else date(today.year, max(1, today.month - 4), 3)
            users[key] = User.objects.create(
                employee_code=codes[key],
                email=f"{key}@{DEMO_DOMAIN}",
                password=password_hash,
                name=name,
                designation=designation,
                role=role,
                company=company,
                manager=users[mgr_key] if mgr_key else None,
                office_location=office,
                joining_date=joining,
                phone=f"+91 98{rnd.randint(10000000, 99999999)}",
            )
        cfg.default_cc.set([users["admin"]])

        for u in users.values():
            for year in {start.year, today.year}:
                credit_balances_for_user(u, year)

        types = {lt.name.split()[0].lower(): lt for lt in LeaveType.objects.filter(company=company)}
        cal = WorkCalendar(company.id, start - timedelta(days=10), today + timedelta(days=60), settings_obj=cfg)

        def working_day(offset: int) -> date:
            """The |offset|-th working day before (negative) or after (positive) today."""
            step = 1 if offset > 0 else -1
            d, n = today, 0
            while n < abs(offset):
                d += timedelta(days=step)
                if cal.is_working(d):
                    n += 1
            return d

        # --- Leave requests ---------------------------------------------
        leave_days: dict[int, set[date]] = {u.id: set() for u in users.values()}

        def leave(key, type_key, start_d, end_d, status, reason, cc=(), half="", comment=""):
            user = users[key]
            lt = types[type_key]
            is_half = bool(half)
            days = count_leave_days(company.id, start_d, end_d, is_half, calendar=cal)
            decided = status in (RequestStatus.APPROVED, RequestStatus.REJECTED)
            from core.approvals import resolve_approver

            approver = resolve_approver(user)
            req = LeaveRequest.objects.create(
                company=company,
                user=user,
                leave_type=lt,
                from_date=start_d,
                to_date=end_d,
                is_half_day=is_half,
                half=half,
                days=days,
                reason=reason,
                status=status,
                approver=approver,
                decided_by=(approver or users["admin"]) if decided else None,
                decided_at=timezone.now() - timedelta(days=rnd.randint(1, 5)) if decided else None,
                decision_comment=comment,
            )
            cc_users = {users[c] for c in cc} | set(cfg.default_cc.all())
            LeaveRequestCC.objects.bulk_create([LeaveRequestCC(request=req, user=c) for c in cc_users if c != user])
            # Pending + approved leave books the balance; rejected/cancelled don't.
            if status in (RequestStatus.PENDING, RequestStatus.APPROVED):
                deduct_balance(user.id, lt, start_d.year, days, enforce=False)
            if status == RequestStatus.APPROVED and not is_half:
                d = start_d
                while d <= end_d:
                    if cal.is_working(d):
                        leave_days[user.id].add(d)
                    d += timedelta(days=1)
            return req

        leave("ananya", "casual", working_day(-20), working_day(-19), RequestStatus.APPROVED, "Family function in Chennai.", cc=["neha"], comment="Enjoy!")
        leave("sneha", "sick", working_day(-9), working_day(-9), RequestStatus.APPROVED, "Fever and cold.", comment="Get well soon.")
        leave("vikram", "casual", working_day(-6), working_day(-6), RequestStatus.REJECTED, "Personal errand.", comment="Release day: please pick another date.")
        leave("neha", "casual", working_day(4), working_day(4), RequestStatus.CANCELLED, "Bank work.")
        if cal.is_working(today):
            leave("meera", "casual", today, today, RequestStatus.APPROVED, "Moving to a new apartment.", cc=["sneha"])
        leave("karan", "earned", working_day(5), working_day(7), RequestStatus.PENDING, "Trip to Goa with family.", cc=["neha", "ananya"])
        leave("arjun", "casual", working_day(2), working_day(2), RequestStatus.PENDING, "Sister's graduation ceremony.")
        leave("priya", "casual", working_day(8), working_day(9), RequestStatus.PENDING, "Attending a wedding.", cc=["rohan"])
        leave("rahul", "sick", working_day(1), working_day(1), RequestStatus.PENDING, "Doctor's appointment.", half="first")

        # --- Attendance history -------------------------------------------
        rows: list[Attendance] = []
        missed_punch_day = working_day(-3)
        wfh_day = working_day(-12)
        now_ist = timezone.now().astimezone(IST)

        def jitter(v: Decimal) -> Decimal:
            return (v + Decimal(rnd.uniform(-0.00025, 0.00025))).quantize(Decimal("0.000001"))

        for u in users.values():
            d = max(start, u.joining_date or start)
            while d <= today:
                if not cal.is_working(d):
                    d += timedelta(days=1)
                    continue
                if d in leave_days[u.id]:
                    rows.append(Attendance(company=company, user=u, date=d, status=AttendanceStatus.ON_LEAVE, source=AttendanceSource.SYSTEM, office_location=office))
                    d += timedelta(days=1)
                    continue

                is_today = d == today
                if is_today and (now_ist.hour < 10 or rnd.random() < 0.3):
                    d += timedelta(days=1)  # hasn't checked in yet today
                    continue

                roll = rnd.random()
                if u.email.startswith("karan") and d == missed_punch_day:
                    roll = 0.985  # forced incomplete -> missed-punch request below
                if u.email.startswith("ananya") and d == wfh_day:
                    roll = 0.95  # forced absent -> approved WFH below
                if 0.94 <= roll < 0.97 and not is_today:
                    rows.append(Attendance(company=company, user=u, date=d, status=AttendanceStatus.ABSENT, source=AttendanceSource.SYSTEM, office_location=office))
                    d += timedelta(days=1)
                    continue

                late = 0.78 <= roll < 0.90
                cin = time(9, rnd.randint(46, 59)) if late else time(9, rnd.randint(5, 44))
                if late and rnd.random() < 0.4:
                    cin = time(10, rnd.randint(0, 35))
                check_in = combine_ist(d, cin)
                half_day = 0.90 <= roll < 0.94
                incomplete = roll >= 0.97 and not is_today
                check_out = None
                if not is_today and not incomplete:
                    hours = rnd.uniform(3.0, 4.2) if half_day else rnd.uniform(8.6, 9.8)
                    check_out = check_in + timedelta(hours=hours)
                mins = worked_minutes(check_in, check_out)
                late_flag = is_late(check_in, cfg)
                status = (
                    AttendanceStatus.INCOMPLETE
                    if incomplete
                    else derive_status(late=late_flag, minutes=mins, checked_out=check_out is not None, cfg=cfg)
                )
                acc_in, acc_out = round(rnd.uniform(6, 35), 1), round(rnd.uniform(6, 35), 1)
                rows.append(
                    Attendance(
                        company=company,
                        user=u,
                        date=d,
                        status=status,
                        source=AttendanceSource.GPS,
                        office_location=office,
                        check_in_at=check_in,
                        check_in_lat=jitter(OFFICE["lat"]),
                        check_in_lng=jitter(OFFICE["lng"]),
                        check_in_accuracy_m=acc_in,
                        check_in_distance_m=round(rnd.uniform(3, 45), 1),
                        check_in_ip="203.0.113.10",
                        check_in_user_agent="Mozilla/5.0 (Linux; Android 14) Demo",
                        check_out_at=check_out,
                        check_out_lat=jitter(OFFICE["lat"]) if check_out else None,
                        check_out_lng=jitter(OFFICE["lng"]) if check_out else None,
                        check_out_accuracy_m=acc_out if check_out else None,
                        check_out_distance_m=round(rnd.uniform(3, 45), 1) if check_out else None,
                        check_out_ip="203.0.113.10" if check_out else None,
                        check_out_user_agent="Mozilla/5.0 (Linux; Android 14) Demo" if check_out else "",
                        worked_minutes=mins,
                        is_late=late_flag,
                        # Most people write a note at check-out; a few skip it (it's optional by default).
                        work_summary=work_note(u, rnd) if check_out and rnd.random() < 0.8 else "",
                        work_summary_updated_at=check_out if check_out else None,
                    )
                )
                d += timedelta(days=1)
        Attendance.objects.bulk_create(rows, ignore_conflicts=True)

        # --- Birthdays: someone today, a couple this week, the rest spread over the year.
        for i, u in enumerate(sorted(users.values(), key=lambda x: x.email)):
            offset = [0, 1, 4, 9, 23, 41, 77, 120, 160, 200, 260][i % 11]
            bday = today + timedelta(days=offset)
            u.date_of_birth = date(rnd.randint(1984, 2000), bday.month, min(bday.day, 28) if bday.month == 2 else bday.day)
        User.objects.bulk_update(list(users.values()), ["date_of_birth"])

        # --- Regularization requests ----------------------------------------
        from core.approvals import resolve_approver

        RegularizationRequest.objects.create(
            company=company,
            user=users["karan"],
            date=missed_punch_day,
            type=RegularizationType.MISSED_PUNCH,
            check_in_time=time(9, 30),
            check_out_time=time(18, 45),
            reason="Forgot to check out. Left office around 6:45 PM after the release call.",
            approver=resolve_approver(users["karan"]),
        )
        wfh = RegularizationRequest.objects.create(
            company=company,
            user=users["ananya"],
            date=wfh_day,
            type=RegularizationType.WORK_FROM_HOME,
            check_in_time=time(9, 30),
            check_out_time=time(18, 30),
            reason="Plumber visit at home; worked remotely all day.",
            approver=users["priya"],
            status=RequestStatus.APPROVED,
            decided_by=users["priya"],
            decided_at=timezone.now() - timedelta(days=10),
            decision_comment="Approved.",
        )
        cin, cout = combine_ist(wfh_day, time(9, 30)), combine_ist(wfh_day, time(18, 30))
        Attendance.objects.update_or_create(
            user=users["ananya"],
            date=wfh_day,
            defaults={
                "company": company,
                "status": AttendanceStatus.PRESENT,
                "source": AttendanceSource.REGULARIZATION,
                "check_in_at": cin,
                "check_out_at": cout,
                "worked_minutes": worked_minutes(cin, cout),
                "is_late": False,
                "remarks": wfh.get_type_display(),
            },
        )
        RegularizationRequest.objects.create(
            company=company,
            user=users["arjun"],
            date=working_day(-2),
            type=RegularizationType.CLIENT_VISIT,
            check_in_time=time(10, 0),
            check_out_time=time(17, 30),
            reason="Full-day client demo at Infinity Retail, Whitefield.",
            approver=resolve_approver(users["arjun"]),
        )
        self.stdout.write(f"Created {len(users)} users, {len(rows)} attendance rows, {LeaveRequest.objects.filter(company=company).count()} leave requests.")
