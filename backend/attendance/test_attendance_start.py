"""Company "attendance tracking start": days before it are blank, never Absent (joining dates untouched)."""

from datetime import date, timedelta

import pytest

from attendance.models import Attendance
from attendance.services import close_day
from company.models import CompanySettings
from conftest import WEDNESDAY

pytestmark = pytest.mark.django_db

MON = WEDNESDAY - timedelta(days=2)  # 9 Nov 2026
TUE = WEDNESDAY - timedelta(days=1)


def _start(company, d):
    CompanySettings.objects.filter(company=company).update(attendance_start=d)


def _calendar(client):
    days = client.get("/api/attendance/calendar/?year=2026&month=11").data["days"]
    return {d["date"]: d["status"] for d in days}


def test_days_before_start_are_blank_not_absent(employee, client_for, at):
    at(WEDNESDAY, "12:00")
    _start(employee.company, WEDNESDAY)
    cal = _calendar(client_for(employee))
    assert cal[MON] is None and cal[TUE] is None  # before HRMS: blank
    assert cal[WEDNESDAY] == "not_checked_in"  # tracking has started
    employee.refresh_from_db()
    assert employee.joining_date == date(2024, 1, 1)  # unchanged


def test_without_start_past_days_are_absent(employee, client_for, at):
    at(WEDNESDAY, "12:00")
    cal = _calendar(client_for(employee))
    assert cal[MON] == "absent"


def test_nightly_job_skips_days_before_start(employee, at):
    at(WEDNESDAY, "23:55")
    _start(employee.company, WEDNESDAY)
    assert close_day(TUE)["absent"] == 0
    assert not Attendance.objects.filter(date=TUE).exists()
    assert close_day(WEDNESDAY)["absent"] >= 1


def test_team_view_and_reports_respect_start(employee, manager, client_for, at):
    at(WEDNESDAY, "12:00")
    _start(employee.company, WEDNESDAY)
    team = client_for(manager).get(f"/api/attendance/team/?date={TUE}").data
    rows = team["results"] if isinstance(team, dict) and "results" in team else team
    rows = rows if isinstance(rows, list) else rows.get("rows", [])
    mine = [r for r in rows if r["user"]["id"] == employee.id]
    assert mine and mine[0]["status"] is None


def test_no_corrections_before_start(employee, client_for, at):
    at(WEDNESDAY, "12:00")
    _start(employee.company, WEDNESDAY)
    r = client_for(employee).post(
        "/api/regularizations/",
        {"date": str(TUE), "type": "missed_punch", "check_in_time": "09:30", "check_out_time": "18:30", "reason": "Forgot"},
        format="json",
    )
    assert r.status_code == 400 and r.data["error"]["code"] == "before_tracking"


def test_admin_can_set_and_clear_it(admin_user, client_for):
    c = client_for(admin_user)
    assert c.patch("/api/company/settings/", {"attendance_start": "2026-11-24"}, format="json").data["attendance_start"] == "2026-11-24"
    assert c.patch("/api/company/settings/", {"attendance_start": None}, format="json").data["attendance_start"] is None
