from datetime import date, timedelta

import pytest

from conftest import WEDNESDAY
from leaves.models import LeaveType
from leaves.services import credit_balances_for_user
from notifications.models import Notification

pytestmark = pytest.mark.django_db
URL = "/api/notifications/"


def titles(client):
    return [n["title"] for n in client.get(URL).data["results"]]


def test_leave_flow_notifies_the_right_people(admin_user, manager, employee, make_user, client_for, at):
    at(WEDNESDAY, "10:00")
    cc = make_user("cc@test.co")
    credit_balances_for_user(employee, 2026)
    casual = LeaveType.objects.get(company=employee.company, name="Casual Leave")
    day = str(WEDNESDAY + timedelta(days=5))
    e, m = client_for(employee), client_for(manager)
    rid = e.post("/api/leave/requests/", {"leave_type": casual.id, "from_date": day, "to_date": day, "reason": "Family", "cc_ids": [cc.id]},
                 format="json").data["id"]
    assert titles(m) == ["Emp applied for casual leave"]
    assert titles(client_for(cc)) == ["Emp applied for leave (you're CC'd)"]
    assert titles(e) == []  # never notified about your own action
    m.post(f"/api/leave/requests/{rid}/approve/", {"comment": "Enjoy"}, format="json")
    mine = e.get(URL).data["results"]
    assert mine[0]["title"] == "Your casual leave was approved" and mine[0]["kind"] == "leave_approved"
    assert '"Enjoy"' in mine[0]["body"] and mine[0]["link"] == "/leave" and mine[0]["actor"]["id"] == manager.id
    assert titles(client_for(cc))[0] == "Emp's leave was approved"
    e.post(f"/api/leave/requests/{rid}/cancel/", format="json")
    assert titles(m)[0] == "Emp cancelled their approved leave"


def test_regularization_notifies(employee, manager, client_for, at):
    at(WEDNESDAY, "11:00")
    mon = WEDNESDAY - timedelta(days=2)
    body = {"date": str(mon), "type": "missed_punch", "check_in_time": "09:30", "check_out_time": "18:30", "reason": "Forgot"}
    rid = client_for(employee).post("/api/regularizations/", body, format="json").data["id"]
    assert titles(client_for(manager)) == ["Emp requested a missed punch"]
    client_for(manager).post(f"/api/regularizations/{rid}/reject/", {"comment": "No proof"}, format="json")
    assert titles(client_for(employee)) == ["Your missed punch request was rejected"]


def test_read_unread_read_all_delete_and_privacy(admin_user, manager, employee, client_for):
    for i in range(3):
        Notification.objects.create(company=employee.company, recipient=employee, kind="news", title=f"N{i}")
    other = Notification.objects.create(company=manager.company, recipient=manager, kind="news", title="Theirs")
    c = client_for(employee)
    s = c.get(f"{URL}summary/").data
    assert s["unread"] == 3 and s["latest"]["title"] == "N2"
    first = c.get(URL).data["results"][0]
    assert c.post(f"{URL}{first['id']}/read/").data["is_read"] is True
    assert c.get(f"{URL}summary/").data["unread"] == 2
    assert c.get(URL, {"filter": "unread"}).data["count"] == 2
    assert c.post(f"{URL}{first['id']}/unread/").data["is_read"] is False
    assert c.post(f"{URL}read-all/").data["marked"] == 3
    assert c.get(f"{URL}summary/").data == {"unread": 0, "latest": None}
    assert c.delete(f"{URL}{first['id']}/").status_code == 204
    assert c.post(f"{URL}clear-read/").status_code == 204
    assert c.get(URL).data["count"] == 0
    # Someone else's notification doesn't exist for you
    assert c.post(f"{URL}{other.id}/read/").status_code == 404
    assert c.delete(f"{URL}{other.id}/").status_code == 404


def test_news_notifies_everyone_and_feed_visit_marks_read(admin_user, employee, manager, client_for):
    client_for(admin_user).post("/api/news/", {"title": "Town hall", "body": "Friday 4pm", "category": "announcement"}, format="multipart")
    e = client_for(employee)
    assert titles(e) == ["Announcement: Town hall"] and titles(client_for(admin_user)) == []
    e.post("/api/news/seen/")
    assert e.get(f"{URL}summary/").data["unread"] == 0


def test_birthdays_once_per_day_and_wishes(admin_user, employee, manager, client_for, at):
    at(WEDNESDAY, "10:00")
    from accounts.models import User

    User.objects.filter(pk=employee.pk).update(date_of_birth=date(1995, WEDNESDAY.month, WEDNESDAY.day))
    m = client_for(manager)
    m.get(f"{URL}summary/")
    m.get(f"{URL}summary/")
    assert titles(m) == ["It's Emp's birthday today 🎂"]  # only once
    assert titles(client_for(employee))[0].startswith("Happy birthday, Emp")
    m.post("/api/celebrations/wishes/", {"to_user": employee.id, "message": "Have a great one!"}, format="json")
    m.post("/api/celebrations/wishes/", {"to_user": employee.id, "message": "Again"}, format="json")
    got = [n for n in client_for(employee).get(URL).data["results"] if n["kind"] == "birthday_wish"]
    assert len(got) == 1 and got[0]["title"] == "Manager wished you a happy birthday 🎉"
