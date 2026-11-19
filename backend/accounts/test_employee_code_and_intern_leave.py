from datetime import date, timedelta
from decimal import Decimal

import pytest

from conftest import WEDNESDAY
from core.constants import Role
from leaves.models import LeaveBalance, LeaveType
from leaves.services import credit_balances_for_user

pytestmark = pytest.mark.django_db
URL = "/api/employees/"


def _body(manager, office, **kw):
    return {"name": "New Person", "email": "new@test.co", "role": "employee", "manager_id": manager.id,
            "office_location_id": office.id, "joining_date": "2026-11-02", "use_email_as_password": True, **kw}


# ---------------------------------------------------------------- employee IDs

def test_codes_are_assigned_in_sequence_per_prefix(admin_user, manager, office, client_for, at):
    at(WEDNESDAY, "10:00")
    c = client_for(admin_user)
    a = c.post(URL, _body(manager, office), format="json").data
    b = c.post(URL, _body(manager, office, email="b@test.co"), format="json").data
    i = c.post(URL, _body(manager, office, email="i@test.co", role="intern"), format="json").data
    assert a["employee_code"] == "EMP001" and b["employee_code"] == "EMP002" and i["employee_code"] == "INT001"
    # Search by ID
    assert [r["email"] for r in c.get(URL, {"search": "emp002"}).data["results"]] == ["b@test.co"]


def test_custom_code_unique_and_normalised(admin_user, manager, office, client_for, at):
    at(WEDNESDAY, "10:00")
    c = client_for(admin_user)
    r = c.post(URL, _body(manager, office, employee_code=" hr-07 "), format="json")
    assert r.data["employee_code"] == "HR-07"
    r = c.post(URL, _body(manager, office, email="dup@test.co", employee_code="hr-07"), format="json")
    assert r.status_code == 400 and "already used by New Person" in str(r.data["error"]["fields"]["employee_code"])
    r = c.post(URL, _body(manager, office, email="bad@test.co", employee_code="A B!"), format="json")
    assert r.status_code == 400
    # Blank on edit keeps the existing ID
    pid = c.get(URL, {"search": "hr-07"}).data["results"][0]["id"]
    assert c.patch(f"{URL}{pid}/", {"employee_code": "", "designation": "X"}, format="json").data["employee_code"] == "HR-07"


def test_intern_converted_to_employee_gets_next_emp_number(admin_user, manager, office, client_for, at):
    at(WEDNESDAY, "10:00")
    c = client_for(admin_user)
    c.post(URL, _body(manager, office), format="json")  # EMP001
    i = c.post(URL, _body(manager, office, email="i@test.co", role="intern", internship_end="2027-01-31"), format="json").data
    assert i["employee_code"] == "INT001"
    r = c.patch(f"{URL}{i['id']}/", {"role": "employee"}, format="json")
    assert r.data["employee_code"] == "EMP002"
    from core.models import AuditLog

    assert "employee_code" in AuditLog.objects.get(target_user_id=i["id"], action="user_updated").message


def test_other_companies_can_reuse_numbers(admin_user, client_for):
    from accounts.models import User
    from company.models import Company

    other = Company.objects.create(name="Other")
    User.objects.create_user(email="o@other.co", password="x", name="O", company=other, employee_code="EMP001")
    User.objects.filter(pk=admin_user.pk).update(employee_code="EMP001")  # same code, different company: allowed


# ---------------------------------------------------------------- interns: just "Leave", counted on approval

def test_new_intern_has_only_leave(admin_user, manager, office, client_for, at):
    at(WEDNESDAY, "10:00")
    r = client_for(admin_user).post(URL, _body(manager, office, role="intern", internship_end="2027-03-31"), format="json")
    rows = list(LeaveBalance.objects.filter(user_id=r.data["id"], year=2026).values_list("leave_type__name", "total", "used"))
    assert rows == [("Leave", 0, 0)]
    # Not offered to anyone in the leave-type list / settings
    assert "Leave" not in [t["name"] for t in client_for(admin_user).get("/api/leave/types/").data]


def test_intern_leave_counts_on_approval(manager, make_user, client_for, at):
    at(WEDNESDAY, "10:00")
    intern = make_user("in@test.co", Role.INTERN, manager=manager, internship_start=date(2026, 9, 1))
    c = client_for(intern)
    casual = LeaveType.objects.get(company=intern.company, name="Casual Leave")
    day = str(WEDNESDAY + timedelta(days=5))
    # No type needed (any type sent is ignored: interns always get "Leave")
    p = c.post("/api/leave/preview/", {"from_date": day, "to_date": day}, format="json")
    assert p.status_code == 200 and p.data["issues"] == []
    r = c.post("/api/leave/requests/", {"leave_type": casual.id, "from_date": day, "to_date": day, "reason": "Exam"}, format="json")
    assert r.status_code == 201 and r.data["leave_type"]["name"] == "Leave"
    taken = lambda: [(b["leave_type"]["name"], float(b["used"])) for b in c.get("/api/leave/balances/").data]
    assert taken() == [("Leave", 0)]  # pending: not counted yet
    client_for(manager).post(f"/api/leave/requests/{r.data['id']}/approve/", {}, format="json")
    assert taken() == [("Leave", 1)]  # approved: +1
    c.post(f"/api/leave/requests/{r.data['id']}/cancel/", format="json")
    assert taken() == [("Leave", 0)]  # cancelled before it starts: back down
    # Rejected requests never count
    day2 = str(WEDNESDAY + timedelta(days=6))
    r2 = c.post("/api/leave/requests/", {"from_date": day2, "to_date": day2, "reason": "Trip"}, format="json")
    client_for(manager).post(f"/api/leave/requests/{r2.data['id']}/reject/", {}, format="json")
    assert taken() == [("Leave", 0)]
    # Pending cancel doesn't go negative
    r3 = c.post("/api/leave/requests/", {"from_date": day2, "to_date": day2, "reason": "Trip again"}, format="json")
    c.post(f"/api/leave/requests/{r3.data['id']}/cancel/", format="json")
    assert taken() == [("Leave", 0)]


def test_staff_cannot_use_intern_leave(employee, client_for, at):
    at(WEDNESDAY, "10:00")
    from leaves.services import intern_leave_type

    lt = intern_leave_type(employee.company_id)
    day = str(WEDNESDAY + timedelta(days=5))
    r = client_for(employee).post("/api/leave/requests/", {"leave_type": lt.id, "from_date": day, "to_date": day, "reason": "x x"}, format="json")
    assert r.status_code == 400
    assert "Leave" not in [b["leave_type"]["name"] for b in client_for(employee).get("/api/leave/balances/").data]


def test_role_change_rebalances_paid_leave(admin_user, employee, client_for, at):
    at(WEDNESDAY, "10:00")
    credit_balances_for_user(employee, 2026)
    casual = LeaveBalance.objects.get(user=employee, leave_type__name="Casual Leave", year=2026)
    LeaveBalance.objects.filter(pk=casual.pk).update(used=Decimal("2"))
    c = client_for(admin_user)
    r = c.patch(f"{URL}{employee.id}/", {"role": "intern", "internship_end": "2027-01-31"}, format="json")
    assert r.status_code == 200, r.data
    casual.refresh_from_db()
    assert casual.total == 2 and casual.available == 0  # keeps what was used, nothing more to take
    c.patch(f"{URL}{employee.id}/", {"role": "employee"}, format="json")
    casual.refresh_from_db()
    assert casual.total == 2  # pro-rata from 11 Nov: Nov doesn't count (after the 15th? no: day 11 counts) -> 2 months * 1 = 2
    earned = LeaveBalance.objects.get(user=employee, leave_type__name="Earned Leave", year=2026)
    assert earned.total == Decimal("2.5")  # 15 * 2 / 12 = 2.5
