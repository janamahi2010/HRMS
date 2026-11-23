from datetime import date

import pytest

from core.constants import Role


@pytest.fixture
def team(make_user, admin_user):
    make_user("zara@test.co", Role.INTERN, manager=admin_user, designation="Analyst", joining_date=date(2025, 3, 1))
    make_user("bala@test.co", Role.EMPLOYEE, manager=admin_user, designation="", joining_date=date(2024, 6, 1))
    make_user("chitra@test.co", Role.EMPLOYEE, manager=admin_user, designation="Designer", joining_date=date(2023, 1, 1), is_active=False)
    return admin_user


def names(client, ordering=None):
    params = {}
    if ordering:
        params["ordering"] = ordering
    r = client.get("/api/employees/", params)
    assert r.status_code == 200
    return [row["name"] for row in r.data["results"]]


def test_default_is_by_name(team, client_for):
    assert names(client_for(team)) == ["Admin", "Bala", "Chitra", "Zara"]


def test_sort_each_column_both_ways(team, client_for):
    c = client_for(team)
    # Blank designation goes last in both directions; ties fall back to name.
    assert names(c, "designation") == ["Zara", "Chitra", "Admin", "Bala"]
    assert names(c, "-designation") == ["Chitra", "Zara", "Admin", "Bala"]
    assert names(c, "-joining_date") == ["Zara", "Bala", "Admin", "Chitra"]
    assert names(c, "joining_date") == ["Chitra", "Admin", "Bala", "Zara"]
    assert names(c, "role") == ["Admin", "Bala", "Chitra", "Zara"]
    # Admin has no manager -> last.
    assert names(c, "manager__name") == ["Bala", "Chitra", "Zara", "Admin"]
    assert names(c, "-is_active") == ["Admin", "Bala", "Zara", "Chitra"]
    assert names(c, "office_location__name") == ["Admin", "Bala", "Chitra", "Zara"]


def test_unknown_field_is_ignored(team, client_for):
    assert names(client_for(team), "password") == ["Admin", "Bala", "Chitra", "Zara"]
