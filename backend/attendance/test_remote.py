import pytest

from accounts.models import User
from attendance.models import Attendance
from conftest import OFFICE, WEDNESDAY

pytestmark = pytest.mark.django_db
FAR = {"lat": 17.385, "lng": 78.4867, "accuracy": 20}  # another city
AT_OFFICE = {"lat": OFFICE[0], "lng": OFFICE[1], "accuracy": 10}


def test_office_people_still_need_to_be_at_the_office(employee, client_for, at):
    at(WEDNESDAY, "09:30")
    c = client_for(employee)
    r = c.post("/api/attendance/check-in/", FAR, format="json")
    assert r.status_code == 400 and r.data["error"]["code"] == "outside_radius"
    r = c.post("/api/attendance/check-in/", {}, format="json")
    assert r.status_code == 400 and r.data["error"]["code"] == "location_required"


def test_remote_person_checks_in_from_anywhere(employee, admin_user, client_for, at):
    at(WEDNESDAY, "09:30")
    r = client_for(admin_user).patch(f"/api/employees/{employee.id}/", {"remote_allowed": True}, format="json")
    assert r.status_code == 200 and r.data["remote_allowed"] is True
    c = client_for(employee)
    assert c.get("/api/attendance/today/").data["remote_allowed"] is True
    r = c.post("/api/attendance/check-in/", FAR, format="json")
    assert r.status_code == 201 and r.data["record"]["source"] == "remote"
    row = Attendance.objects.get(user=employee, date=WEDNESDAY)
    assert row.check_in_lat is not None and row.check_in_distance_m > 1000  # location still recorded
    at(WEDNESDAY, "18:45")
    r = c.post("/api/attendance/check-out/", {}, format="json")  # location off: still fine
    assert r.status_code == 200 and r.data["record"]["check_out_at"]
    row.refresh_from_db()
    assert row.check_out_lat is None and row.worked_minutes == 555


def test_remote_person_at_the_office_is_a_normal_punch(employee, client_for, at):
    User.objects.filter(pk=employee.pk).update(remote_allowed=True)
    at(WEDNESDAY, "09:30")
    r = client_for(employee).post("/api/attendance/check-in/", AT_OFFICE, format="json")
    assert r.data["record"]["source"] == "gps"


def test_remote_person_without_office_is_not_blocked(employee, client_for, at):
    User.objects.filter(pk=employee.pk).update(remote_allowed=True, office_location=None)
    at(WEDNESDAY, "09:30")
    c = client_for(employee)
    today = c.get("/api/attendance/today/").data
    assert today["blocked"] is None and today["can_check_in"] is True
    assert c.post("/api/attendance/check-in/", {}, format="json").status_code == 201
