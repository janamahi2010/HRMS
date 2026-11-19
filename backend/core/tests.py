"""Cross-cutting tests: notifications, error format, auth scoping basics."""

from datetime import timedelta

import pytest
from django.core import mail

from company.services import get_settings
from conftest import WEDNESDAY
from core.constants import Role
from leaves.models import LeaveType
from leaves.services import credit_balances_for_user

pytestmark = pytest.mark.django_db


@pytest.fixture
def ready(employee, manager, admin_user, at):
    at(WEDNESDAY, "10:00")
    for u in (employee, manager, admin_user):
        credit_balances_for_user(u, 2026)
    mail.outbox.clear()


def _leave(client, company, **kw):
    lt = LeaveType.objects.get(company=company, name="Casual Leave")
    d = WEDNESDAY + timedelta(days=5)
    return client.post(
        "/api/leave/requests/",
        {"leave_type": lt.id, "from_date": str(d), "to_date": str(d), "reason": "Wedding", **kw},
        format="json",
    )


def test_leave_emails_flow(ready, employee, manager, admin_user, make_user, client_for, django_capture_on_commit_callbacks):
    hr = make_user("hr@test.co")
    with django_capture_on_commit_callbacks(execute=True):
        rid = _leave(client_for(employee), employee.company, cc_ids=[hr.id]).data["id"]
    to = {m.to[0]: m for m in mail.outbox}
    assert set(to) == {"manager@test.co", "hr@test.co"}
    approval = to["manager@test.co"]
    assert "Leave request from Emp" in approval.subject
    html = approval.alternatives[0][0]
    assert "Hi Manager" in html and "https://app.test/leave?tab=approvals" in html and "Wedding" in html
    assert "FYI" in to["hr@test.co"].subject

    mail.outbox.clear()
    with django_capture_on_commit_callbacks(execute=True):
        client_for(manager).post(f"/api/leave/requests/{rid}/approve/", {"comment": "Have fun"}, format="json")
    assert len(mail.outbox) == 1
    m = mail.outbox[0]
    assert m.to == ["emp@test.co"] and m.cc == ["hr@test.co"] and "approved" in m.subject
    assert "Have fun" in m.alternatives[0][0]

    mail.outbox.clear()
    with django_capture_on_commit_callbacks(execute=True):
        client_for(employee).post(f"/api/leave/requests/{rid}/cancel/", format="json")
    assert [m.to for m in mail.outbox] == [["manager@test.co"]] and "cancelled" in mail.outbox[0].subject


def test_admin_pool_emails_all_admins_and_default_cc(ready, manager, admin_user, make_user, client_for, django_capture_on_commit_callbacks):
    manager.manager = None
    manager.save()
    make_user("admin2@test.co", Role.ADMIN)
    get_settings(manager.company_id).default_cc.set([admin_user])
    with django_capture_on_commit_callbacks(execute=True):
        _leave(client_for(manager), manager.company)
    recipients = sorted(m.to[0] for m in mail.outbox)
    # Both admins get the approval email; admin@ is also default CC (separate FYI email).
    assert recipients == ["admin2@test.co", "admin@test.co", "admin@test.co"]


def test_failed_request_sends_nothing(ready, employee, client_for, django_capture_on_commit_callbacks):
    lt = LeaveType.objects.get(company=employee.company, name="Casual Leave")
    with django_capture_on_commit_callbacks(execute=True):
        r = client_for(employee).post(
            "/api/leave/requests/",
            {"leave_type": lt.id, "from_date": str(WEDNESDAY + timedelta(days=5)), "to_date": str(WEDNESDAY + timedelta(days=60)), "reason": "Long trip"},
            format="json",
        )
    assert r.status_code == 400 and mail.outbox == []


def test_regularization_emails(ready, employee, manager, client_for, django_capture_on_commit_callbacks):
    body = {"date": str(WEDNESDAY - timedelta(days=2)), "type": "wfh", "check_in_time": "09:30", "check_out_time": "18:30", "reason": "Internet outage at office"}
    with django_capture_on_commit_callbacks(execute=True):
        rid = client_for(employee).post("/api/regularizations/", body, format="json").data["id"]
    assert [m.to for m in mail.outbox] == [["manager@test.co"]]
    mail.outbox.clear()
    with django_capture_on_commit_callbacks(execute=True):
        client_for(manager).post(f"/api/regularizations/{rid}/reject/", {"comment": "Not approved"}, format="json")
    assert mail.outbox[0].to == ["emp@test.co"] and "rejected" in mail.outbox[0].subject


def test_error_format_and_auth(client_for, employee, at):
    from rest_framework.test import APIClient

    r = APIClient().get("/api/dashboard/")
    assert r.status_code == 401 and set(r.data["error"]) >= {"code", "message"}
    r = client_for(employee).get("/api/employees/")
    assert r.status_code == 403 and r.data["error"]["code"] == "permission_denied"
    r = client_for(employee).post("/api/regularizations/", {}, format="json")
    assert r.status_code == 400 and r.data["error"]["code"] == "validation_error" and "date" in r.data["error"]["fields"]
