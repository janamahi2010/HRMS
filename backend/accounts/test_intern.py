"""Intern role: dates only for interns, days-left maths, approvals routing, dashboard list."""

from datetime import date, timedelta

import pytest

from accounts.internship import internship_info
from conftest import WEDNESDAY
from core.approvals import resolve_approver
from core.constants import Role

pytestmark = pytest.mark.django_db
URL = "/api/employees/"


def _intern_body(manager, office, **kw):
    return {
        "name": "Ira Intern",
        "email": "ira@test.co",
        "role": "intern",
        "manager_id": manager.id,
        "office_location_id": office.id,
        "joining_date": "2026-09-01",
        "internship_end": "2026-12-31",
        "send_invite": False,
        **kw,
    }


def test_create_intern_with_dates(admin_user, manager, office, client_for, at):
    at(WEDNESDAY, "10:00")
    r = client_for(admin_user).post(URL, _intern_body(manager, office), format="json")
    assert r.status_code == 201, r.data
    assert r.data["role"] == "intern"
    assert r.data["internship_start"] == "2026-09-01"  # defaults to the joining date
    i = r.data["internship"]
    assert i["end"].isoformat() == "2026-12-31" and i["days_left"] == 50 and i["status"] == "active"
    assert i["total_days"] == 122 and 0 < i["progress"] < 100


def test_dates_validation(admin_user, manager, office, client_for, at):
    at(WEDNESDAY, "10:00")
    c = client_for(admin_user)
    r = c.post(URL, _intern_body(manager, office, internship_start="2026-12-01", internship_end="2026-11-01"), format="json")
    assert r.status_code == 400 and "internship_end" in r.data["error"]["fields"]
    r = c.post(URL, _intern_body(manager, office, joining_date=None), format="json")
    assert r.status_code == 400 and "internship_start" in r.data["error"]["fields"]


def test_dates_only_for_interns(admin_user, employee, client_for, at):
    at(WEDNESDAY, "10:00")
    c = client_for(admin_user)
    # Ignored for non-interns
    r = c.patch(f"{URL}{employee.id}/", {"internship_end": "2026-12-31"}, format="json")
    assert r.status_code == 200 and r.data["internship_end"] is None and r.data["internship"] is None
    # Become an intern, then convert to employee: dates are cleared, history is in the audit log
    r = c.patch(f"{URL}{employee.id}/", {"role": "intern", "internship_start": "2026-10-01", "internship_end": "2027-01-31"}, format="json")
    assert r.data["internship"]["days_left"] == 81
    r = c.patch(f"{URL}{employee.id}/", {"role": "employee"}, format="json")
    assert r.data["internship"] is None and r.data["internship_start"] is None
    from core.models import AuditLog

    msgs = " ".join(AuditLog.objects.filter(target_user=employee).values_list("message", flat=True))
    assert "internship_end" in msgs and "role" in msgs


def test_status_transitions():
    class U:
        role = Role.INTERN
        joining_date = date(2026, 1, 1)
        internship_start = date(2026, 1, 1)
        internship_end = date(2026, 6, 30)

    assert internship_info(U, date(2026, 6, 30))["days_left"] == 0  # last day
    assert internship_info(U, date(2026, 6, 20))["status"] == "ending_soon"
    assert internship_info(U, date(2026, 3, 1))["status"] == "active"
    ended = internship_info(U, date(2026, 7, 5))
    assert ended["status"] == "ended" and ended["days_left"] == -5
    U.internship_start = date(2026, 8, 1)
    U.internship_end = date(2026, 12, 1)
    assert internship_info(U, date(2026, 7, 1))["status"] == "upcoming"
    U.internship_end = None
    assert internship_info(U, date(2026, 9, 1))["status"] == "ongoing"


def test_intern_requests_go_to_manager(manager, make_user):
    intern = make_user("in@test.co", Role.INTERN, manager=manager, internship_start=date(2026, 9, 1))
    assert resolve_approver(intern) == manager


def test_intern_sees_only_own_data(manager, employee, make_user, client_for):
    intern = make_user("in2@test.co", Role.INTERN, manager=manager)
    c = client_for(intern)
    assert c.get(URL).status_code == 403
    assert c.get(f"/api/people/{employee.id}/overview/").status_code == 404
    me = c.get("/api/auth/me/").data
    assert me["role"] == "intern" and "internship" in me


def test_dashboard_lists_internships_ending(admin_user, manager, make_user, client_for, at):
    at(WEDNESDAY, "10:00")
    make_user("soon@test.co", Role.INTERN, manager=manager, internship_start=date(2026, 6, 1), internship_end=WEDNESDAY + timedelta(days=10))
    make_user("ended@test.co", Role.INTERN, manager=manager, internship_start=date(2026, 5, 1), internship_end=WEDNESDAY - timedelta(days=3))
    make_user("later@test.co", Role.INTERN, manager=manager, internship_start=date(2026, 6, 1), internship_end=WEDNESDAY + timedelta(days=90))
    items = client_for(admin_user).get("/api/dashboard/").data["team"]["internships"]
    assert [(i["user"]["name"], i["days_left"]) for i in items] == [("Ended", -3), ("Soon", 10)]
    # Managers see their own interns too.
    assert len(client_for(manager).get("/api/dashboard/").data["team"]["internships"]) == 2


def test_profile_gives_admin_the_exact_editable_values(admin_user, manager, make_user, client_for):
    """Regression: editing from the profile page must not blank date of birth or internship dates."""
    intern = make_user(
        "keep@test.co", Role.INTERN, manager=manager,
        date_of_birth=date(2001, 4, 9), internship_start=date(2026, 9, 1), internship_end=date(2027, 2, 28),
    )
    d = client_for(admin_user).get(f"/api/people/{intern.id}/overview/").data
    assert d["editable"] == {"date_of_birth": date(2001, 4, 9), "internship_start": date(2026, 9, 1), "internship_end": date(2027, 2, 28)}
    assert d["profile"]["internship"]["status"] in ("active", "ending_soon", "upcoming")
    assert client_for(manager).get(f"/api/people/{intern.id}/overview/").data["editable"] is None
