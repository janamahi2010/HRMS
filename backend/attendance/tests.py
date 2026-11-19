from datetime import date, timedelta
from decimal import Decimal

import pytest

from attendance.models import Attendance
from attendance.services import close_day
from company.models import Holiday
from conftest import OFFICE, WEDNESDAY
from core.constants import RequestStatus
from core.geo import haversine_m

pytestmark = pytest.mark.django_db

AT_OFFICE = {"lat": OFFICE[0], "lng": OFFICE[1], "accuracy": 20}
# ~111 m per 0.001 deg latitude
FAR = {"lat": OFFICE[0] + 0.003, "lng": OFFICE[1], "accuracy": 20}


def _leave(user, d1, d2, half_day=False, half=""):
    from leaves.models import LeaveRequest, LeaveType

    lt = LeaveType.objects.get(company=user.company, name="Casual Leave")
    return LeaveRequest.objects.create(
        company=user.company, user=user, leave_type=lt, from_date=d1, to_date=d2, is_half_day=half_day, half=half,
        days=Decimal("0.5") if half_day else Decimal("1"), reason="x", status=RequestStatus.APPROVED,
    )


def test_haversine_known_distance():
    # Bengaluru -> Chennai is ~290 km great-circle.
    assert 285_000 < haversine_m(12.9716, 77.5946, 13.0827, 80.2707) < 295_000
    assert haversine_m(*OFFICE, *OFFICE) == 0


def test_check_in_on_time_inside_radius(employee, client_for, at):
    assert WEDNESDAY.weekday() == 2
    at(WEDNESDAY, "09:40")
    r = client_for(employee).post("/api/attendance/check-in/", AT_OFFICE, format="json")
    assert r.status_code == 201, r.data
    rec = r.data["record"]
    assert rec["status"] == "present" and rec["is_late"] is False
    assert r.data["can_check_in"] is False and r.data["can_check_out"] is True
    row = Attendance.objects.get(user=employee, date=WEDNESDAY)
    assert row.check_in_ip == "127.0.0.1" and row.check_in_distance_m == 0


def test_late_after_threshold(employee, client_for, at):
    at(WEDNESDAY, "09:46")
    r = client_for(employee).post("/api/attendance/check-in/", AT_OFFICE, format="json")
    assert r.data["record"]["status"] == "late"


def test_outside_radius_rejected_with_distance(employee, client_for, at):
    at(WEDNESDAY, "09:30")
    r = client_for(employee).post("/api/attendance/check-in/", FAR, format="json")
    assert r.status_code == 400
    err = r.data["error"]
    assert err["code"] == "outside_radius"
    assert 320 < err["distance_m"] < 350 and err["radius_m"] == 100
    assert not Attendance.objects.exists()


def test_poor_accuracy_rejected(employee, client_for, at):
    at(WEDNESDAY, "09:30")
    r = client_for(employee).post("/api/attendance/check-in/", {**AT_OFFICE, "accuracy": 151}, format="json")
    assert r.data["error"]["code"] == "low_accuracy"


def test_edge_of_radius_allowed(employee, client_for, at):
    at(WEDNESDAY, "09:30")
    # ~89 m north: inside the 100 m radius.
    r = client_for(employee).post("/api/attendance/check-in/", {**AT_OFFICE, "lat": OFFICE[0] + 0.0008}, format="json")
    assert r.status_code == 201


def test_duplicate_check_in_rejected(employee, client_for, at):
    at(WEDNESDAY, "09:30")
    c = client_for(employee)
    assert c.post("/api/attendance/check-in/", AT_OFFICE, format="json").status_code == 201
    r = c.post("/api/attendance/check-in/", AT_OFFICE, format="json")
    assert r.status_code == 409 and r.data["error"]["code"] == "already_checked_in"


@pytest.mark.parametrize(
    "setup,code",
    [
        ("weekly_off", "weekly_off"),
        ("holiday", "holiday"),
        ("leave", "on_leave"),
        ("no_office", "no_office"),
        ("inactive_office", "office_inactive"),
    ],
)
def test_blocked_days(employee, office, client_for, at, setup, code):
    d = WEDNESDAY
    if setup == "weekly_off":
        d = WEDNESDAY + timedelta(days=3)  # Saturday
    elif setup == "holiday":
        Holiday.objects.create(company=employee.company, date=d, name="Founders Day")
    elif setup == "leave":
        _leave(employee, d, d)
    elif setup == "no_office":
        employee.office_location = None
        employee.save()
    elif setup == "inactive_office":
        office.is_active = False
        office.save()
    at(d, "09:30")
    c = client_for(employee)
    today = c.get("/api/attendance/today/").data
    assert today["can_check_in"] is False and today["blocked"]["code"] == code
    r = c.post("/api/attendance/check-in/", AT_OFFICE, format="json")
    assert r.status_code == 400 and r.data["error"]["code"] == code


def test_half_day_leave_allows_punch_and_halves_requirement(employee, client_for, at):
    _leave(employee, WEDNESDAY, WEDNESDAY, half_day=True, half="first")
    c = client_for(employee)
    at(WEDNESDAY, "14:00")
    r = c.post("/api/attendance/check-in/", AT_OFFICE, format="json")
    assert r.status_code == 201 and r.data["record"]["is_late"] is False  # second-half arrival isn't late
    at(WEDNESDAY, "16:30")  # 2.5h >= 4.5h / 2
    r = c.post("/api/attendance/check-out/", AT_OFFICE, format="json")
    assert r.data["record"]["status"] == "present"


def test_check_out_flow_and_half_day(employee, client_for, at):
    c = client_for(employee)
    assert c.post("/api/attendance/check-out/", AT_OFFICE, format="json").data["error"]["code"] == "not_checked_in"
    at(WEDNESDAY, "09:30")
    c.post("/api/attendance/check-in/", AT_OFFICE, format="json")
    at(WEDNESDAY, "13:00")  # 3.5h < 4.5h
    r = c.post("/api/attendance/check-out/", FAR, format="json")
    assert r.data["error"]["code"] == "outside_radius"
    r = c.post("/api/attendance/check-out/", AT_OFFICE, format="json")
    assert r.status_code == 200
    assert r.data["record"]["status"] == "half_day" and r.data["record"]["worked_minutes"] == 210
    r = c.post("/api/attendance/check-out/", AT_OFFICE, format="json")
    assert r.status_code == 409


def test_full_day_late_stays_late(employee, client_for, at):
    c = client_for(employee)
    at(WEDNESDAY, "10:00")
    c.post("/api/attendance/check-in/", AT_OFFICE, format="json")
    at(WEDNESDAY, "19:00")
    assert c.post("/api/attendance/check-out/", AT_OFFICE, format="json").data["record"]["status"] == "late"


def test_close_day(employee, manager, admin_user, make_user, client_for, at):
    at(WEDNESDAY, "09:30")
    client_for(employee).post("/api/attendance/check-in/", AT_OFFICE, format="json")  # never checks out
    _leave(manager, WEDNESDAY, WEDNESDAY)
    make_user("new@test.co", joining_date=WEDNESDAY + timedelta(days=5))  # not joined yet
    make_user("gone@test.co", is_active=False)
    at(WEDNESDAY, "23:55")

    counts = close_day(WEDNESDAY)
    assert counts == {"incomplete": 1, "on_leave": 1, "absent": 1, "skipped_companies": 0}
    statuses = dict(Attendance.objects.filter(date=WEDNESDAY).values_list("user__email", "status"))
    assert statuses == {"emp@test.co": "incomplete", "manager@test.co": "on_leave", "admin@test.co": "absent"}
    # Idempotent
    assert close_day(WEDNESDAY) == {"incomplete": 0, "on_leave": 0, "absent": 0, "skipped_companies": 0}
    # Weekly off: nothing stored
    assert close_day(WEDNESDAY + timedelta(days=3))["skipped_companies"] == 1
    assert not Attendance.objects.filter(date=WEDNESDAY + timedelta(days=3)).exists()


def test_calendar_derives_days_and_scopes(employee, manager, admin_user, make_user, client_for, at):
    Holiday.objects.create(company=employee.company, date=date(2026, 11, 2), name="Holiday")
    _leave(employee, date(2026, 11, 3), date(2026, 11, 3))
    at(WEDNESDAY, "09:30")
    client_for(employee).post("/api/attendance/check-in/", AT_OFFICE, format="json")
    at(WEDNESDAY, "12:00")
    data = client_for(employee).get("/api/attendance/calendar/?year=2026&month=11").data
    by_day = {d["date"].day: d["status"] for d in data["days"]}
    assert by_day[1] == "weekly_off"  # Sunday
    assert by_day[2] == "holiday"
    assert by_day[3] == "on_leave"
    assert by_day[4] == "absent"  # past working day, no row
    assert by_day[11] == "present"
    assert by_day[12] is None  # future
    assert data["summary"]["present"] == 1 and data["summary"]["working_days"] == 20

    # Scoping: manager sees report, employee can't see manager, outsiders 404.
    assert client_for(manager).get(f"/api/attendance/calendar/?user={employee.id}").status_code == 200
    assert client_for(employee).get(f"/api/attendance/calendar/?user={manager.id}").status_code == 404
    other = make_user("peer@test.co", manager=admin_user)
    assert client_for(manager).get(f"/api/attendance/calendar/?user={other.id}").status_code == 404
    assert client_for(admin_user).get(f"/api/attendance/calendar/?user={other.id}").status_code == 200


def test_team_day_scoping(employee, manager, admin_user, make_user, client_for, at):
    make_user("peer@test.co", manager=admin_user)
    at(WEDNESDAY, "10:30")
    client_for(employee).post("/api/attendance/check-in/", AT_OFFICE, format="json")
    assert client_for(employee).get("/api/attendance/team/").status_code == 403
    mgr = client_for(manager).get("/api/attendance/team/").data
    assert {r["user"]["email"] for r in mgr["results"]} == {"manager@test.co", "emp@test.co"}
    assert mgr["summary"] == {"not_checked_in": 1, "late": 1}
    assert client_for(admin_user).get("/api/attendance/team/").data["total"] == 4


# --------------------------------------------------------------------------- daily work summary

SUMMARY_URL = "/api/attendance/work-summary/"


def _check_in(client, at, d=WEDNESDAY, hhmm="09:30"):
    at(d, hhmm)
    assert client.post("/api/attendance/check-in/", AT_OFFICE, format="json").status_code == 201


def test_work_summary_optional_by_default(employee, client_for, at):
    c = client_for(employee)
    _check_in(c, at)
    r = c.put(SUMMARY_URL, {"summary": "  Fixed login bug; client call with Infinity Retail  "}, format="json")
    assert r.status_code == 200, r.data
    assert r.data["work_summary"] == "Fixed login bug; client call with Infinity Retail" and r.data["summary_editable"]
    at(WEDNESDAY, "18:30")
    r = c.post("/api/attendance/check-out/", AT_OFFICE, format="json")
    assert r.status_code == 200 and r.data["record"]["work_summary"].startswith("Fixed login bug")
    assert r.data["work_summary_required"] is False


def test_check_out_without_summary_allowed_when_optional(employee, client_for, at):
    c = client_for(employee)
    _check_in(c, at)
    at(WEDNESDAY, "18:30")
    assert c.post("/api/attendance/check-out/", AT_OFFICE, format="json").status_code == 200


def test_required_summary_blocks_check_out(employee, client_for, at):
    from company.services import get_settings

    cfg = get_settings(employee.company_id)
    cfg.work_summary_required = True
    cfg.save()
    c = client_for(employee)
    _check_in(c, at)
    assert c.get("/api/attendance/today/").data["work_summary_required"] is True
    at(WEDNESDAY, "18:30")
    r = c.post("/api/attendance/check-out/", AT_OFFICE, format="json")
    assert r.status_code == 400 and r.data["error"]["code"] == "work_summary_required"
    c.put(SUMMARY_URL, {"summary": "work"}, format="json")  # too short to count
    assert c.post("/api/attendance/check-out/", AT_OFFICE, format="json").status_code == 400
    c.put(SUMMARY_URL, {"summary": "Reviewed 3 PRs and shipped the leave report"}, format="json")
    assert c.post("/api/attendance/check-out/", AT_OFFICE, format="json").status_code == 200
    r = c.put(SUMMARY_URL, {"summary": ""}, format="json")  # can't wipe it afterwards
    assert r.status_code == 400 and r.data["error"]["code"] == "work_summary_required"


def test_summary_needs_attendance_and_edit_window(employee, client_for, at):
    c = client_for(employee)
    at(WEDNESDAY, "10:00")
    r = c.put(SUMMARY_URL, {"summary": "Did things"}, format="json")
    assert r.status_code == 400 and r.data["error"]["code"] == "no_attendance"
    _check_in(c, at)
    # Next morning before noon: yesterday is still editable.
    at(WEDNESDAY + timedelta(days=1), "11:30")
    r = c.put(SUMMARY_URL, {"date": str(WEDNESDAY), "summary": "Forgot to write this last night"}, format="json")
    assert r.status_code == 200
    # After noon it's locked; older days always locked.
    at(WEDNESDAY + timedelta(days=1), "12:30")
    r = c.put(SUMMARY_URL, {"date": str(WEDNESDAY), "summary": "edit"}, format="json")
    assert r.status_code == 400 and r.data["error"]["code"] == "summary_locked"
    assert len("x" * 2001) > 2000
    at(WEDNESDAY, "12:00")
    assert c.put(SUMMARY_URL, {"summary": "x" * 2001}, format="json").status_code == 400


def test_summary_visibility(employee, manager, admin_user, make_user, client_for, at):
    c = client_for(employee)
    _check_in(c, at)
    c.put(SUMMARY_URL, {"summary": "Built the export feature"}, format="json")
    at(WEDNESDAY, "13:00")
    # Manager and admin can read it (team view, calendar, daily report)...
    team = client_for(manager).get("/api/attendance/team/").data["results"]
    assert next(r for r in team if r["user"]["id"] == employee.id)["record"]["work_summary"] == "Built the export feature"
    cal = client_for(admin_user).get("/api/attendance/calendar/", {"user": employee.id, "year": 2026, "month": 11}).data
    assert next(d for d in cal["days"] if d["date"] == WEDNESDAY)["record"]["work_summary"] == "Built the export feature"
    daily = client_for(admin_user).get("/api/reports/attendance/daily/", {"from": str(WEDNESDAY), "to": str(WEDNESDAY), "user": employee.id}).data
    assert daily["results"][0]["work_summary"] == "Built the export feature"
    # ...a peer can't, and nobody can write someone else's note (the endpoint only ever touches your own row).
    peer = make_user("peer@test.co", manager=admin_user)
    assert client_for(peer).get("/api/attendance/calendar/", {"user": employee.id}).status_code == 404
    r = client_for(manager).put(SUMMARY_URL, {"summary": "Manager overwrite"}, format="json")
    assert r.status_code == 400 and r.data["error"]["code"] == "no_attendance"
    employee.refresh_from_db()
    from attendance.models import Attendance as A

    assert A.objects.get(user=employee, date=WEDNESDAY).work_summary == "Built the export feature"


def test_company_setting_toggle(admin_user, employee, client_for):
    r = client_for(admin_user).patch("/api/company/settings/", {"work_summary_required": True}, format="json")
    assert r.status_code == 200 and r.data["work_summary_required"] is True
    assert client_for(employee).patch("/api/company/settings/", {"work_summary_required": False}, format="json").status_code == 403


def test_late_approved_wfh_day_gets_48h_to_add_a_note(employee, manager, client_for, at):
    mon = WEDNESDAY - timedelta(days=2)
    at(WEDNESDAY - timedelta(days=1), "10:00")
    rid = client_for(employee).post(
        "/api/regularizations/",
        {"date": str(mon), "type": "wfh", "check_in_time": "09:30", "check_out_time": "18:30", "reason": "Worked from home"},
        format="json",
    ).data["id"]
    # Approved three days after the WFH day: the normal "noon next day" window has long passed.
    at(mon + timedelta(days=3), "15:00")
    assert client_for(manager).post(f"/api/regularizations/{rid}/approve/", format="json").status_code == 200
    r = client_for(employee).put(SUMMARY_URL, {"date": str(mon), "summary": "Wrote the onboarding guide from home"}, format="json")
    assert r.status_code == 200, r.data
    assert r.data["summary_editable"] and r.data["summary_editable_until"]
    # 48 h after approval it locks.
    at(mon + timedelta(days=5), "15:30")
    r = client_for(employee).put(SUMMARY_URL, {"date": str(mon), "summary": "edit"}, format="json")
    assert r.status_code == 400 and r.data["error"]["code"] == "summary_locked"


def test_editable_until_is_noon_next_day(employee, client_for, at):
    c = client_for(employee)
    _check_in(c, at)
    rec = c.get("/api/attendance/today/").data["record"]
    assert rec["summary_editable_until"].isoformat() == "2026-11-12T12:00:00+05:30"
