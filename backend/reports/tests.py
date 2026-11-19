from datetime import timedelta

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext

from attendance.models import Attendance
from conftest import OFFICE, WEDNESDAY
from leaves.services import credit_balances_for_user

pytestmark = pytest.mark.django_db
AT = {"lat": OFFICE[0], "lng": OFFICE[1], "accuracy": 10}


@pytest.fixture
def week(employee, manager, admin_user, make_user, client_for, at):
    """Mon–Wed of the test week: employee present Mon, late Tue, absent (no row) Wed-so-far."""
    mon = WEDNESDAY - timedelta(days=2)
    at(mon, "09:30")
    client_for(employee).post("/api/attendance/check-in/", AT, format="json")
    at(mon, "18:30")
    client_for(employee).post("/api/attendance/check-out/", AT, format="json")
    at(mon + timedelta(days=1), "10:30")
    client_for(employee).post("/api/attendance/check-in/", AT, format="json")
    at(mon + timedelta(days=1), "19:30")
    client_for(employee).post("/api/attendance/check-out/", AT, format="json")
    at(WEDNESDAY, "12:00")
    for u in (employee, manager, admin_user):
        credit_balances_for_user(u, 2026)
    return mon


def test_dashboard_by_role(week, employee, manager, admin_user, client_for):
    emp = client_for(employee).get("/api/dashboard/").data
    assert emp["role"] == "employee" and "team" not in emp and "company" not in emp
    assert emp["me"]["month"]["present"] == 2 and emp["me"]["month"]["late"] == 1
    assert len(emp["me"]["balances"]) == 4 and emp["today"]["can_check_in"] is True

    mgr = client_for(manager).get("/api/dashboard/").data
    assert mgr["team"]["size"] == 1 and mgr["team"]["today"] == {"not_checked_in": 1}

    adm = client_for(admin_user).get("/api/dashboard/").data
    assert adm["company"]["active"] == 3 and adm["team"]["size"] == 3
    assert adm["company"]["trend"][-1]["date"] == WEDNESDAY


def test_dashboard_query_count_is_bounded(week, admin_user, make_user, client_for):
    for i in range(15):
        make_user(f"extra{i}@test.co")
    c = client_for(admin_user)
    with CaptureQueriesContext(connection) as ctx:
        assert c.get("/api/dashboard/").status_code == 200
    assert len(ctx.captured_queries) < 45, len(ctx.captured_queries)


def test_attendance_summary_and_scope(week, employee, manager, admin_user, make_user, client_for):
    make_user("peer@test.co", manager=admin_user)
    url = "/api/reports/attendance/summary/"
    assert client_for(employee).get(url).status_code == 403
    r = client_for(manager).get(url, {"from": str(week), "to": str(WEDNESDAY - timedelta(days=1))})
    assert r.status_code == 200
    names = {x["user"]["name"] for x in r.data["results"]}
    assert names == {"Manager", "Emp"}  # manager sees self + reports only
    emp = next(x for x in r.data["results"] if x["user"]["id"] == employee.id)
    assert (emp["present"], emp["late"], emp["working_days"], emp["attendance_rate"]) == (1, 1, 2, 100)
    assert emp["avg_check_in"] == "10:00" and emp["worked_minutes"] == 1080
    adm = client_for(admin_user).get(url, {"from": str(week), "to": str(WEDNESDAY)}).data
    assert len(adm["results"]) == 4


def test_range_validation(admin_user, client_for, at):
    at(WEDNESDAY, "12:00")
    url = "/api/reports/attendance/summary/"
    r = client_for(admin_user).get(url, {"from": "2026-11-10", "to": "2026-11-01"})
    assert r.status_code == 400 and r.data["error"]["code"] == "invalid_range"
    r = client_for(admin_user).get(url, {"from": "2026-01-01", "to": "2026-11-01"})
    assert r.data["error"]["code"] == "range_too_long"
    assert client_for(admin_user).get(url, {"from": "nope"}).status_code == 400


def test_daily_log_and_leave_report(week, employee, admin_user, client_for):
    r = client_for(admin_user).get("/api/reports/attendance/daily/", {"from": str(week), "to": str(WEDNESDAY), "user": employee.id})
    statuses = [x["status"] for x in r.data["results"]]
    assert statuses == ["present", "late", "not_checked_in"]
    assert r.data["results"][0]["check_in"] == "09:30"
    lr = client_for(admin_user).get("/api/reports/leave/", {"year": 2026}).data
    assert len(lr["types"]) == 4 and len(lr["results"]) == 3
    assert Attendance.objects.count() == 2
