"""Employee profile page endpoints: content and, above all, who may see whom."""

import pytest

from conftest import OFFICE, WEDNESDAY
from core.constants import Role
from leaves.services import credit_balances_for_user

pytestmark = pytest.mark.django_db
AT = {"lat": OFFICE[0], "lng": OFFICE[1], "accuracy": 10}


def url(uid, part="overview"):
    return f"/api/people/{uid}/{part}/"


def test_overview_content(employee, manager, admin_user, client_for, at):
    at(WEDNESDAY, "09:30")
    client_for(employee).post("/api/attendance/check-in/", AT, format="json")
    credit_balances_for_user(employee, 2026)
    r = client_for(admin_user).get(url(employee.id))
    assert r.status_code == 200, r.data
    d = r.data
    assert d["profile"]["email"] == "emp@test.co" and d["profile"]["manager"]["id"] == manager.id
    assert [c["id"] for c in d["chain"]] == [manager.id, admin_user.id]  # Emp -> Manager -> Admin
    assert d["today"]["status"] == "present" and d["month"]["present"] >= 1
    assert len(d["balances"]) == 4 and d["can_manage"] is True and d["is_self"] is False
    # A manager's profile lists their team.
    m = client_for(admin_user).get(url(manager.id)).data
    assert [x["id"] for x in m["direct_reports"]] == [employee.id]


def test_visibility_rules(employee, manager, admin_user, make_user, client_for):
    peer = make_user("peer@test.co", manager=admin_user)
    # Admin: anyone.
    assert client_for(admin_user).get(url(peer.id)).status_code == 200
    # Manager: own direct report yes, someone else's report no (404, not 403), and no admin actions.
    r = client_for(manager).get(url(employee.id))
    assert r.status_code == 200 and r.data["can_manage"] is False
    assert client_for(manager).get(url(peer.id)).status_code == 404
    assert client_for(manager).get(url(admin_user.id)).status_code == 404
    # Employee: only themselves.
    assert client_for(employee).get(url(employee.id)).data["is_self"] is True
    assert client_for(employee).get(url(manager.id)).status_code == 404
    assert client_for(employee).get(url(peer.id, "activity")).status_code == 404


def test_other_company_is_invisible(admin_user, client_for):
    from accounts.models import User
    from company.models import Company

    stranger = User.objects.create_user(email="x@other.co", password="pw", name="X", company=Company.objects.create(name="Other"), role=Role.EMPLOYEE)
    assert client_for(admin_user).get(url(stranger.id)).status_code == 404
    assert client_for(admin_user).get(url(stranger.id, "activity")).status_code == 404


def test_inactive_people_still_viewable_by_admin(employee, admin_user, client_for):
    assert client_for(admin_user).post(f"/api/employees/{employee.id}/deactivate/").status_code == 200
    r = client_for(admin_user).get(url(employee.id))
    assert r.status_code == 200 and r.data["profile"]["is_active"] is False


def test_activity_timeline(employee, admin_user, client_for):
    client_for(admin_user).patch(f"/api/employees/{employee.id}/", {"designation": "Senior Engineer"}, format="json")
    client_for(admin_user).post(f"/api/employees/{employee.id}/deactivate/")
    client_for(admin_user).post(f"/api/employees/{employee.id}/activate/")
    items = client_for(admin_user).get(url(employee.id, "activity")).data
    actions = [i["action"] for i in items]
    assert actions[:3] == ["user_activated", "user_deactivated", "user_updated"]  # newest first
    assert items[0]["actor"]["id"] == admin_user.id
    assert actions[-1] in ("user_created", "joined")  # always ends with how they joined
