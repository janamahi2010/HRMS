from datetime import datetime, time, timedelta

import pytest

from attendance.models import Attendance
from attendance.services import IST
from conftest import WEDNESDAY
from notifications.models import Notification

pytestmark = pytest.mark.django_db
MON, TUE = WEDNESDAY - timedelta(days=2), WEDNESDAY - timedelta(days=1)


def punch(user, d, out=True):
    return Attendance.objects.create(
        company=user.company, user=user, date=d, status="present",
        check_in_at=datetime.combine(d, time(9, 30), tzinfo=IST),
        check_out_at=datetime.combine(d, time(18, 30), tzinfo=IST) if out else None,
    )


def kinds(user, kind):
    return list(Notification.objects.filter(recipient=user, kind=kind).values_list("title", flat=True))


def test_evening_reminder_once(employee, client_for, at):
    punch(employee, WEDNESDAY, out=False)
    c = client_for(employee)
    at(WEDNESDAY, "18:45")  # shift ends 18:30, reminder after 19:00
    c.get("/api/notifications/summary/")
    assert kinds(employee, "checkout_reminder") == []
    at(WEDNESDAY, "19:05")
    c.get("/api/notifications/summary/")
    c.get("/api/notifications/summary/")
    assert kinds(employee, "checkout_reminder") == ["You haven't checked out yet"]
    n = Notification.objects.get(recipient=employee, kind="checkout_reminder")
    assert "6:30 PM" in n.body


def test_cron_command_reminds_everyone_still_in(employee, manager, at):
    from django.core.management import call_command

    punch(employee, WEDNESDAY, out=False)
    punch(manager, WEDNESDAY, out=True)
    at(WEDNESDAY, "20:00")
    call_command("send_checkout_reminders")
    call_command("send_checkout_reminders")
    assert len(kinds(employee, "checkout_reminder")) == 1 and kinds(manager, "checkout_reminder") == []


def test_next_day_nudge_and_dashboard_until_fixed(employee, manager, client_for, at):
    punch(employee, MON, out=False)
    punch(employee, TUE, out=False)
    at(WEDNESDAY, "09:00")
    e = client_for(employee)
    d = e.get("/api/dashboard/").data
    assert [str(x["date"]) for x in d["me"]["missed_checkouts"]] == [str(TUE), str(MON)]
    e.get("/api/notifications/summary/")
    n = Notification.objects.get(recipient=employee, kind="missed_checkout")
    assert n.title.startswith("You forgot to check out on Tue") and "1 more day" in n.body
    assert n.link == f"/requests?new=1&date={TUE.isoformat()}"
    # Manager sees it too
    team = client_for(manager).get("/api/dashboard/").data["team"]["forgot_checkout"]
    assert team[0]["user"]["id"] == employee.id and team[0]["count"] == 2 and team[0]["unfixed"] == 2
    # Fix Tuesday with a missed-punch request
    e.post("/api/regularizations/", {"date": str(TUE), "type": "missed_punch", "check_in_time": "09:30", "check_out_time": "18:30", "reason": "Forgot"}, format="json")
    d = e.get("/api/dashboard/").data
    assert [str(x["date"]) for x in d["me"]["missed_checkouts"]] == [str(MON)]
    team = client_for(manager).get("/api/dashboard/").data["team"]["forgot_checkout"]
    assert team[0]["count"] == 2 and team[0]["unfixed"] == 1  # still counts as forgotten, but one is being fixed
