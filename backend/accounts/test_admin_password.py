"""Admin-set passwords: create with a password, forced change at first sign-in, reset for existing people."""

import pytest
from django.core import mail
from rest_framework.test import APIClient

from core.models import AuditLog

pytestmark = pytest.mark.django_db
URL = "/api/employees/"


def _login(email, password):
    return APIClient().post("/api/auth/login/", {"email": email, "password": password}, format="json")


def test_create_with_password_skips_invite_and_forces_change(admin_user, manager, office, client_for, django_capture_on_commit_callbacks):
    body = {
        "name": "Pia Password", "email": "pia@test.co", "role": "employee",
        "manager_id": manager.id, "office_location_id": office.id, "joining_date": "2026-11-01",
        "password": "Welcome@2026!", "must_change_password": True,
    }
    with django_capture_on_commit_callbacks(execute=True):
        r = client_for(admin_user).post(URL, body, format="json")
    assert r.status_code == 201, r.data
    assert "password" not in r.data  # never echoed back
    assert r.data["invite_pending"] is False
    assert mail.outbox == []  # no invite email needed

    r = _login("pia@test.co", "Welcome@2026!")
    assert r.status_code == 200 and r.data["user"]["must_change_password"] is True

    c = APIClient()
    c.credentials(HTTP_AUTHORIZATION=f"Bearer {r.data['access']}")
    r = c.post("/api/auth/password/change/", {"current_password": "Welcome@2026!", "new_password": "MyOwn#Secret99"}, format="json")
    assert r.status_code == 200 and r.data["user"]["must_change_password"] is False
    assert _login("pia@test.co", "Welcome@2026!").status_code == 400
    assert _login("pia@test.co", "MyOwn#Secret99").data["user"]["must_change_password"] is False


def test_weak_admin_password_rejected(admin_user, manager, office, client_for):
    body = {"name": "Weak", "email": "weak@test.co", "role": "employee", "manager_id": manager.id,
            "office_location_id": office.id, "password": "password"}
    r = client_for(admin_user).post(URL, body, format="json")
    assert r.status_code == 400 and "password" in r.data["error"]["fields"]


def test_create_without_password_still_invites(admin_user, manager, office, client_for, django_capture_on_commit_callbacks):
    body = {"name": "Ivy Invite", "email": "ivy@test.co", "role": "employee", "manager_id": manager.id, "office_location_id": office.id}
    with django_capture_on_commit_callbacks(execute=True):
        r = client_for(admin_user).post(URL, body, format="json")
    assert r.data["invite_pending"] is True and mail.outbox[-1].to == ["ivy@test.co"]


def test_admin_sets_password_for_existing_person(admin_user, employee, manager, client_for):
    old = _login("emp@test.co", "pw").data["refresh"]
    url = f"{URL}{employee.id}/set-password/"
    assert client_for(manager).post(url, {"password": "Temp#Pass2026"}, format="json").status_code == 403
    assert client_for(admin_user).post(url, {"password": "123"}, format="json").status_code == 400
    r = client_for(admin_user).post(url, {"password": "Temp#Pass2026", "must_change_password": True}, format="json")
    assert r.status_code == 200 and "password" not in r.data
    # Their old sessions are signed out; the new password works and asks for a change.
    assert APIClient().post("/api/auth/refresh/", {"refresh": old}, format="json").status_code == 401
    assert _login("emp@test.co", "Temp#Pass2026").data["user"]["must_change_password"] is True
    log = AuditLog.objects.filter(target_user=employee, action="password_set_by_admin").first()
    assert log and "Temp#Pass2026" not in log.message and "Temp" not in str(log.data)
    # Admins change their own password from My profile instead.
    assert client_for(admin_user).post(f"{URL}{admin_user.id}/set-password/", {"password": "Another#Pass1"}, format="json").status_code == 400


def test_password_cannot_be_changed_via_edit(admin_user, employee, client_for):
    client_for(admin_user).patch(f"{URL}{employee.id}/", {"password": "Sneaky#Pass123"}, format="json")
    assert _login("emp@test.co", "Sneaky#Pass123").status_code == 400
    assert _login("emp@test.co", "pw").status_code == 200


def test_default_password_is_their_email_and_must_change(admin_user, manager, office, client_for, django_capture_on_commit_callbacks):
    body = {"name": "Eli Email", "email": "Eli.Email@Test.co", "role": "employee", "manager_id": manager.id,
            "office_location_id": office.id, "use_email_as_password": True, "must_change_password": False}
    with django_capture_on_commit_callbacks(execute=True):
        r = client_for(admin_user).post(URL, body, format="json")
    assert r.status_code == 201, r.data
    assert r.data["password_change_pending"] is True and r.data["invite_pending"] is False
    assert mail.outbox == []
    r = _login("eli.email@test.co", "eli.email@test.co")  # first password = their email
    assert r.status_code == 200 and r.data["user"]["must_change_password"] is True  # forced, even though False was sent
    c = APIClient()
    c.credentials(HTTP_AUTHORIZATION=f"Bearer {r.data['access']}")
    c.post("/api/auth/password/change/", {"current_password": "eli.email@test.co", "new_password": "Eli#Own2026pw"}, format="json")
    assert _login("eli.email@test.co", "eli.email@test.co").status_code == 400  # email no longer works
    emp = client_for(admin_user).get(URL, {"search": "eli"}).data["results"][0]
    assert emp["password_change_pending"] is False


def test_reset_to_email(admin_user, employee, client_for):
    r = client_for(admin_user).post(f"{URL}{employee.id}/set-password/", {"use_email": True}, format="json")
    assert r.status_code == 200 and r.data["password_change_pending"] is True
    assert _login("emp@test.co", "emp@test.co").data["user"]["must_change_password"] is True
    assert client_for(admin_user).post(f"{URL}{employee.id}/set-password/", {}, format="json").status_code == 400
