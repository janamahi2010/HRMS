from datetime import date

import pytest
from django.core import mail
from rest_framework.test import APIClient

from company.models import Company, OfficeLocation
from core.constants import Role
from leaves.models import LeaveBalance

pytestmark = pytest.mark.django_db


def test_signup_login_refresh_logout(settings):
    c = APIClient()
    r = c.post("/api/auth/signup/", {"company_name": "Rocket Labs", "name": "Asha Rao", "email": "Asha@Rocket.io", "password": "Str0ng!pass"}, format="json")
    assert r.status_code == 201, r.data
    assert r.data["user"]["role"] == "admin" and r.data["user"]["email"] == "asha@rocket.io"
    company = Company.objects.get(name="Rocket Labs")
    assert company.leave_types.count() == 4 and hasattr(company, "settings")

    bad = c.post("/api/auth/login/", {"email": "asha@rocket.io", "password": "nope"}, format="json")
    assert bad.status_code == 400 and bad.data["error"]["code"] == "validation_error"
    tokens = c.post("/api/auth/login/", {"email": "ASHA@rocket.io", "password": "Str0ng!pass"}, format="json").data
    me = c.get("/api/auth/me/", HTTP_AUTHORIZATION=f"Bearer {tokens['access']}")
    assert me.status_code == 200 and me.data["company"]["name"] == "Rocket Labs"

    new = c.post("/api/auth/refresh/", {"refresh": tokens["refresh"]}, format="json")
    assert new.status_code == 200 and new.data["refresh"] != tokens["refresh"]
    reused = c.post("/api/auth/refresh/", {"refresh": tokens["refresh"]}, format="json")
    assert reused.status_code == 200  # rotated, but reusable within the grace window (see tokens.py)
    assert c.post("/api/auth/logout/", {"refresh": new.data["refresh"]}, format="json", HTTP_AUTHORIZATION=f"Bearer {new.data['access']}").status_code == 204
    assert c.post("/api/auth/refresh/", {"refresh": new.data["refresh"]}, format="json").status_code == 401


def test_deactivated_user_cannot_login(make_user):
    make_user("gone@test.co", is_active=False)
    r = APIClient().post("/api/auth/login/", {"email": "gone@test.co", "password": "pw"}, format="json")
    assert r.status_code == 400 and "deactivated" in r.data["error"]["message"].lower()


def test_employee_crud_permissions_and_rules(admin_user, manager, employee, office, client_for, django_capture_on_commit_callbacks, at):
    at(date(2026, 7, 1), "10:00")
    url = "/api/employees/"
    assert client_for(manager).get(url).status_code == 403
    body = {"name": "New Hire", "email": "new@test.co", "role": "employee", "manager_id": manager.id, "office_location_id": office.id, "joining_date": "2026-07-01"}
    with django_capture_on_commit_callbacks(execute=True):
        r = client_for(admin_user).post(url, body, format="json")
    assert r.status_code == 201, r.data
    assert r.data["invite_pending"] is True and mail.outbox[-1].to == ["new@test.co"]
    casual = LeaveBalance.objects.get(user_id=r.data["id"], leave_type__name="Casual Leave", year=2026)
    assert casual.total == 6  # pro-rata from July
    assert client_for(admin_user).post(url, body, format="json").data["error"]["fields"]["email"]

    # Reporting loop: manager -> employee -> manager
    r = client_for(admin_user).patch(f"{url}{manager.id}/", {"manager_id": employee.id}, format="json")
    assert r.status_code == 400  # employee isn't a manager/admin
    # Can't demote a manager with reports
    r = client_for(admin_user).patch(f"{url}{manager.id}/", {"role": "employee"}, format="json")
    assert r.status_code == 400 and "direct report" in str(r.data["error"]).lower()
    # Can't deactivate yourself
    assert client_for(admin_user).post(f"{url}{admin_user.id}/deactivate/").status_code == 400
    r = client_for(admin_user).post(f"{url}{employee.id}/deactivate/")
    assert r.status_code == 200 and r.data["is_active"] is False


def test_cross_company_isolation(admin_user, employee, client_for):
    other = Company.objects.create(name="Other")
    loc = OfficeLocation.objects.create(company=other, name="X", latitude=1, longitude=1)
    from accounts.models import User

    stranger = User.objects.create_user(email="s@other.co", password="pw", name="S", company=other, role=Role.EMPLOYEE)
    c = client_for(admin_user)
    assert c.get(f"/api/employees/{stranger.id}/").status_code == 404
    assert c.patch(f"/api/company/locations/{loc.id}/", {"name": "Y"}, format="json").status_code == 404
    assert c.get("/api/attendance/calendar/", {"user": stranger.id}).status_code == 404
    lookup = c.get("/api/users/lookup/", {"search": "s@other"}).data
    assert lookup == [] or all(u["id"] != stranger.id for u in lookup)


def test_company_settings_permissions(admin_user, employee, client_for):
    assert client_for(employee).get("/api/company/settings/").status_code == 200
    assert client_for(employee).patch("/api/company/settings/", {"late_after": "10:00"}, format="json").status_code == 403
    r = client_for(admin_user).patch("/api/company/settings/", {"office_start": "10:00", "office_end": "09:00"}, format="json")
    assert r.status_code == 400
    r = client_for(admin_user).patch("/api/company/settings/", {"weekly_offs": [0, 1, 2, 3, 4, 5, 6]}, format="json")
    assert r.status_code == 400


def _tokens(email, password="pw"):
    return APIClient().post("/api/auth/login/", {"email": email, "password": password}, format="json").data


def _refresh(token):
    return APIClient().post("/api/auth/refresh/", {"refresh": token}, format="json")


def test_refresh_grace_window_survives_interrupted_rotation(make_user):
    make_user("grace@test.co")
    old = _tokens("grace@test.co")["refresh"]
    first = _refresh(old)
    assert first.status_code == 200
    # The client never stored `first` (page unloaded mid-refresh) and retries with the old token.
    second = _refresh(old)
    assert second.status_code == 200 and second.data["refresh"] not in (old, first.data["refresh"])
    # The replacement works normally.
    assert _refresh(second.data["refresh"]).status_code == 200


def test_refresh_grace_window_expires(make_user):
    from datetime import timedelta

    from django.utils import timezone
    from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken

    make_user("grace2@test.co")
    old = _tokens("grace2@test.co")["refresh"]
    assert _refresh(old).status_code == 200
    BlacklistedToken.objects.update(blacklisted_at=timezone.now() - timedelta(seconds=120))
    assert _refresh(old).status_code == 401


def test_logout_and_password_change_revoke_without_grace(make_user, client_for):
    u = make_user("bye@test.co")
    t = _tokens("bye@test.co")
    rotated = _refresh(t["refresh"]).data
    # Logout with the newest token: every token of that session dies at once, grace or not.
    r = APIClient().post("/api/auth/logout/", {"refresh": rotated["refresh"]}, format="json")
    assert r.status_code == 204
    assert _refresh(rotated["refresh"]).status_code == 401
    assert _refresh(t["refresh"]).status_code == 401  # the just-rotated one is dead too
    # Password change revokes everything immediately.
    t2 = _tokens("bye@test.co")
    c = APIClient()
    c.credentials(HTTP_AUTHORIZATION=f"Bearer {t2['access']}")
    r = c.post("/api/auth/password/change/", {"current_password": "pw", "new_password": "N3w!Passw0rd"}, format="json")
    assert r.status_code == 200, r.data
    assert _refresh(t2["refresh"]).status_code == 401
    assert u.pk
