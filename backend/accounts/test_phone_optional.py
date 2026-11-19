import pytest

pytestmark = pytest.mark.django_db


def test_phone_is_optional_everywhere(admin_user, manager, office, employee, client_for):
    c = client_for(admin_user)
    r = c.post("/api/employees/", {"name": "No Phone", "email": "nophone@test.co", "role": "employee", "manager_id": manager.id,
                                   "office_location_id": office.id, "joining_date": "2026-11-02", "use_email_as_password": True}, format="json")
    assert r.status_code == 201 and r.data["phone"] == ""
    e = client_for(employee)
    assert e.patch("/api/auth/me/", {"phone": "+91 98765 43210"}, format="json").data["phone"] == "+91 98765 43210"
    assert e.patch("/api/auth/me/", {"phone": ""}, format="json").data["phone"] == ""  # can clear it again
