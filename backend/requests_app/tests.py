from datetime import timedelta

import pytest

from attendance.models import Attendance
from company.models import Holiday
from conftest import OFFICE, WEDNESDAY
from core.constants import Role

pytestmark = pytest.mark.django_db
URL = "/api/regularizations/"
MON = WEDNESDAY - timedelta(days=2)


def body(**kw):
    return {"date": str(MON), "type": "missed_punch", "check_in_time": "09:30", "check_out_time": "18:30", "reason": "Forgot to punch out", **kw}


def test_create_routes_to_manager_and_approve_updates_attendance(employee, manager, client_for, at):
    at(WEDNESDAY, "11:00")
    r = client_for(employee).post(URL, body(), format="json")
    assert r.status_code == 201, r.data
    assert r.data["approver"]["id"] == manager.id and r.data["status"] == "pending" and r.data["can_cancel"]

    queue = client_for(manager).get(URL, {"scope": "approvals"}).data
    assert queue["count"] == 1 and queue["results"][0]["can_decide"] is True
    r = client_for(manager).post(f"{URL}{r.data['id']}/approve/", {"comment": "ok"}, format="json")
    assert r.status_code == 200 and r.data["status"] == "approved"
    row = Attendance.objects.get(user=employee, date=MON)
    assert row.status == "present" and row.source == "regularization" and row.worked_minutes == 540
    assert r.data["attendance_status"] == "present"


def test_regularize_incomplete_day_late(employee, manager, client_for, at):
    at(MON, "10:15")
    client_for(employee).post("/api/attendance/check-in/", {"lat": OFFICE[0], "lng": OFFICE[1], "accuracy": 10}, format="json")
    at(WEDNESDAY, "11:00")
    rid = client_for(employee).post(URL, body(check_in_time="10:15", check_out_time="19:00"), format="json").data["id"]
    client_for(manager).post(f"{URL}{rid}/approve/", format="json")
    row = Attendance.objects.get(user=employee, date=MON)
    assert row.status == "late" and row.check_in_lat is not None  # GPS fields kept


@pytest.mark.parametrize(
    "override,code",
    [
        ({"date": str(WEDNESDAY + timedelta(days=1))}, "future_date"),
        ({"date": str(WEDNESDAY - timedelta(days=40))}, "too_old"),
        ({"date": str(WEDNESDAY - timedelta(days=4))}, "weekly_off"),  # Saturday
        ({"check_out_time": "09:00"}, "invalid_times"),
        ({"date": str(WEDNESDAY), "check_out_time": "18:30"}, "invalid_times"),  # later today
    ],
)
def test_validation(employee, client_for, at, override, code):
    at(WEDNESDAY, "11:00")
    r = client_for(employee).post(URL, body(**override), format="json")
    assert r.status_code == 400 and r.data["error"]["code"] == code


def test_holiday_and_duplicate_and_complete(employee, client_for, at):
    at(WEDNESDAY, "11:00")
    Holiday.objects.create(company=employee.company, date=MON - timedelta(days=7), name="H")
    c = client_for(employee)
    assert c.post(URL, body(date=str(MON - timedelta(days=7))), format="json").data["error"]["code"] == "holiday"
    assert c.post(URL, body(), format="json").status_code == 201
    assert c.post(URL, body(type="wfh"), format="json").data["error"]["code"] == "duplicate_request"
    tue = MON + timedelta(days=1)
    Attendance.objects.create(company=employee.company, user=employee, date=tue, status="present",
                              check_in_at="2026-11-10T04:00:00Z", check_out_at="2026-11-10T13:00:00Z")
    assert c.post(URL, body(date=str(tue)), format="json").data["error"]["code"] == "already_complete"
    # Missing reason
    r = c.post(URL, body(reason=""), format="json")
    assert r.status_code == 400 and "reason" in r.data["error"]["fields"]


def test_permissions_cancel_and_reject(employee, manager, admin_user, make_user, client_for, at):
    at(WEDNESDAY, "11:00")
    rid = client_for(employee).post(URL, body(), format="json").data["id"]
    peer = make_user("peer@test.co")
    # Outsider employee can't see or decide; another employee 404s
    assert client_for(peer).post(f"{URL}{rid}/approve/", format="json").status_code == 404
    # Employee can't approve own
    assert client_for(employee).post(f"{URL}{rid}/approve/", format="json").status_code == 403
    # Admin override: can reject
    r = client_for(admin_user).post(f"{URL}{rid}/reject/", {"comment": "No proof"}, format="json")
    assert r.data["status"] == "rejected" and r.data["decision_comment"] == "No proof"
    assert not Attendance.objects.filter(user=employee, date=MON).exists()
    # Can't cancel a decided request; rejection frees the date for a new request
    assert client_for(employee).post(f"{URL}{rid}/cancel/", format="json").status_code == 409
    rid2 = client_for(employee).post(URL, body(), format="json").data["id"]
    assert client_for(manager).post(f"{URL}{rid2}/cancel/", format="json").status_code == 403
    r = client_for(employee).post(f"{URL}{rid2}/cancel/", format="json")
    assert r.data["status"] == "cancelled"
    assert client_for(manager).post(f"{URL}{rid2}/approve/", format="json").status_code == 409


def test_manager_request_goes_to_admin(manager, admin_user, make_user, client_for, at):
    at(WEDNESDAY, "11:00")
    r = client_for(manager).post(URL, body(type="client_visit"), format="json")
    assert r.data["approver"]["id"] == admin_user.id
    assert client_for(manager).get(URL, {"scope": "approvals"}).data["count"] == 0
    make_user("admin2@test.co", Role.ADMIN)
    assert client_for(admin_user).get(URL, {"scope": "approvals"}).data["count"] == 1


def test_scopes(employee, manager, admin_user, client_for, at):
    at(WEDNESDAY, "11:00")
    client_for(employee).post(URL, body(), format="json")
    client_for(manager).post(URL, body(type="wfh"), format="json")
    assert client_for(employee).get(URL).data["count"] == 1
    assert client_for(employee).get(URL, {"scope": "team"}).data["count"] == 1  # employees fall back to mine
    assert client_for(manager).get(URL, {"scope": "team"}).data["count"] == 1
    assert client_for(admin_user).get(URL, {"scope": "team"}).data["count"] == 2
