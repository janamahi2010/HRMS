"""Shared pytest fixtures: a bootstrapped company with an office and three roles."""

from datetime import date, datetime, time
from decimal import Decimal

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from attendance.services import IST
from company.models import Company, OfficeLocation
from company.services import bootstrap_company
from core.constants import Role

OFFICE = (12.935200, 77.624500)  # Koramangala, Bengaluru
WEDNESDAY = date(2026, 11, 11)


@pytest.fixture(autouse=True)
def _fast_hasher(settings, tmp_path_factory):
    settings.PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]
    settings.EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"
    settings.EMAIL_ASYNC = False
    # Never upload to the real Supabase bucket from tests: use a temporary folder.
    settings.STORAGES = {**settings.STORAGES, "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"}}
    settings.MEDIA_ROOT = tmp_path_factory.mktemp("media")
    settings.FRONTEND_URL = "https://app.test"


@pytest.fixture
def company(db):
    c = Company.objects.create(name="Test Co")
    cfg = bootstrap_company(c)
    cfg.weekly_offs = [5, 6]  # Sat, Sun
    cfg.save()
    return c


@pytest.fixture
def office(company):
    return OfficeLocation.objects.create(
        company=company, name="HQ", latitude=Decimal(str(OFFICE[0])), longitude=Decimal(str(OFFICE[1])), radius_m=100
    )


@pytest.fixture
def make_user(company, office):
    from accounts.models import User

    def _make(email, role=Role.EMPLOYEE, manager=None, **extra):
        extra.setdefault("office_location", office)
        extra.setdefault("joining_date", date(2024, 1, 1))
        return User.objects.create_user(
            email=email, password="pw", name=email.split("@")[0].title(), role=role, company=company, manager=manager, **extra
        )

    return _make


@pytest.fixture
def admin_user(make_user):
    return make_user("admin@test.co", Role.ADMIN)


@pytest.fixture
def manager(make_user, admin_user):
    return make_user("manager@test.co", Role.MANAGER, manager=admin_user)


@pytest.fixture
def employee(make_user, manager):
    return make_user("emp@test.co", Role.EMPLOYEE, manager=manager)


@pytest.fixture
def client_for():
    def _client(user):
        c = APIClient()
        c.force_authenticate(user)
        return c

    return _client


@pytest.fixture
def at(monkeypatch):
    """Freeze server time at an IST wall-clock moment: at(date, "09:30")."""

    def _freeze(d: date, hhmm: str):
        h, m = map(int, hhmm.split(":"))
        fixed = datetime.combine(d, time(h, m), tzinfo=IST)
        monkeypatch.setattr(timezone, "now", lambda: fixed)
        return fixed

    return _freeze
