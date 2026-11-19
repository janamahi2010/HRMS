from datetime import timedelta

import pytest

from company.services import get_settings
from conftest import WEDNESDAY
from core.constants import RequestStatus, Role
from leaves.models import LeaveRequest, LeaveType
from leaves.services import credit_balances_for_user

pytestmark = pytest.mark.django_db


def _apply(client, lt, day):
    return client.post("/api/leave/requests/", {"leave_type": lt.id, "from_date": str(day), "to_date": str(day), "reason": "Family"}, format="json")


def test_requests_go_to_backup_while_manager_is_on_leave(admin_user, make_user, client_for, at):
    at(WEDNESDAY, "10:00")
    ceo = make_user("ceo@test.co", Role.ADMIN)
    founder = make_user("founder@test.co", Role.ADMIN)
    emp = make_user("e@test.co", Role.EMPLOYEE, manager=ceo)
    credit_balances_for_user(emp, 2026)
    casual = LeaveType.objects.get(company=emp.company, name="Casual Leave")
    r = client_for(admin_user).patch("/api/company/settings/", {"backup_approver": founder.id}, format="json")
    assert r.status_code == 200 and r.data["backup_approver_user"]["id"] == founder.id
    # CEO in office: request goes to the CEO
    assert _apply(client_for(emp), casual, WEDNESDAY + timedelta(days=7)).data["approver"]["id"] == ceo.id
    # CEO on approved leave today: new requests go to the founder
    LeaveRequest.objects.create(company=ceo.company, user=ceo, leave_type=casual, from_date=WEDNESDAY, to_date=WEDNESDAY,
                                days=1, reason="Off", status=RequestStatus.APPROVED)
    assert _apply(client_for(emp), casual, WEDNESDAY + timedelta(days=8)).data["approver"]["id"] == founder.id


def test_backup_must_be_an_admin(admin_user, employee, client_for):
    r = client_for(admin_user).patch("/api/company/settings/", {"backup_approver": employee.id}, format="json")
    assert r.status_code == 400
    assert get_settings(admin_user.company_id).backup_approver is None
