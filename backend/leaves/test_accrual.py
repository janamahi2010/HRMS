from datetime import date
from decimal import Decimal

import pytest

from conftest import WEDNESDAY
from leaves.models import LeaveBalance, LeaveType
from leaves.services import credit_balances_for_user, monthly_credit, months_due, top_up_monthly

pytestmark = pytest.mark.django_db


def test_months_due_and_rounding():
    today = date(2026, 11, 11)
    assert months_due(None, 2026, today) == 11
    assert months_due(date(2026, 3, 10), 2026, today) == 9  # joined on/before the 15th: March counts
    assert months_due(date(2026, 3, 20), 2026, today) == 8
    assert months_due(None, 2025, today) == 12 and months_due(None, 2027, today) == 0
    assert monthly_credit(15, 1) == Decimal("1.0") and monthly_credit(15, 2) == Decimal("2.5")  # halves add up
    assert monthly_credit(15, 12) == 15 and monthly_credit(10, 11) == Decimal("9.0")


def test_monthly_type_credits_month_by_month(employee, admin_user, client_for, at):
    at(WEDNESDAY, "10:00")  # 11 Nov 2026
    earned = LeaveType.objects.get(company=employee.company, name="Earned Leave")
    r = client_for(admin_user).patch(f"/api/leave/types/{earned.id}/", {"accrual": "monthly"}, format="json")
    assert r.status_code == 200 and r.data["accrual"] == "monthly"
    credit_balances_for_user(employee, 2026)
    bal = LeaveBalance.objects.get(user=employee, leave_type=earned, year=2026)
    assert bal.total == monthly_credit(15, 11) and bal.credited_months == 11  # Jan..Nov
    # Next month: one more share, once
    at(date(2026, 12, 1), "09:00")
    client_for(employee).get("/api/leave/balances/")
    client_for(employee).get("/api/leave/balances/")
    bal.refresh_from_db()
    assert bal.total == 15 and bal.credited_months == 12
    # Yearly types untouched
    casual = LeaveBalance.objects.get(user=employee, leave_type__name="Casual Leave", year=2026)
    assert casual.total == 12


def test_switching_keeps_admin_adjustments(employee, admin_user, client_for, at):
    at(WEDNESDAY, "10:00")
    credit_balances_for_user(employee, 2026)
    earned = LeaveType.objects.get(company=employee.company, name="Earned Leave")
    c = client_for(admin_user)
    c.post("/api/leave/balances/adjust/", {"user": employee.id, "leave_type": earned.id, "year": 2026, "delta": "2", "reason": "Carry forward"}, format="json")
    assert LeaveBalance.objects.get(user=employee, leave_type=earned, year=2026).total == 17
    c.patch(f"/api/leave/types/{earned.id}/", {"accrual": "monthly"}, format="json")
    assert LeaveBalance.objects.get(user=employee, leave_type=earned, year=2026).total == monthly_credit(15, 11) + 2
    c.patch(f"/api/leave/types/{earned.id}/", {"accrual": "yearly"}, format="json")
    assert LeaveBalance.objects.get(user=employee, leave_type=earned, year=2026).total == 17


def test_unpaid_type_is_always_yearly(admin_user, client_for):
    unpaid = LeaveType.objects.get(company=admin_user.company, name="Unpaid Leave")
    r = client_for(admin_user).patch(f"/api/leave/types/{unpaid.id}/", {"accrual": "monthly"}, format="json")
    assert r.data["accrual"] == "yearly"


def test_apply_uses_credited_amount_only(employee, admin_user, client_for, at):
    at(date(2026, 2, 2), "10:00")  # February: 2 months credited
    earned = LeaveType.objects.get(company=employee.company, name="Earned Leave")
    client_for(admin_user).patch(f"/api/leave/types/{earned.id}/", {"accrual": "monthly"}, format="json")
    credit_balances_for_user(employee, 2026)
    p = client_for(employee).post("/api/leave/preview/", {"leave_type": earned.id, "from_date": "2026-02-09", "to_date": "2026-02-13"}, format="json").data
    assert p["balance"]["available"] == 2.5 and any(i["code"] == "insufficient_balance" for i in p["issues"])
    assert top_up_monthly(company_id=employee.company_id) == 0  # nothing due twice
