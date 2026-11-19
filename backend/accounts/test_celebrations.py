from datetime import date, timedelta

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile

from accounts.celebrations import birthday_in_year, next_birthday
from conftest import WEDNESDAY

pytestmark = pytest.mark.django_db
URL = "/api/celebrations/"


def test_leap_day_birthdays():
    assert birthday_in_year(date(2000, 2, 29), 2026) == date(2026, 2, 28)
    assert birthday_in_year(date(2000, 2, 29), 2028) == date(2028, 2, 29)
    assert next_birthday(date(1990, 1, 5), date(2026, 11, 11)) == date(2027, 1, 5)


def _bday(user, d=WEDNESDAY, year=1994):
    user.date_of_birth = d.replace(year=year)
    user.save(update_fields=["date_of_birth"])


def test_todays_birthday_shown_to_everyone_without_year(employee, manager, admin_user, make_user, client_for, at):
    at(WEDNESDAY, "09:00")
    _bday(employee)
    soon = make_user("soon@test.co")
    _bday(soon, WEDNESDAY + timedelta(days=3))
    for viewer in (admin_user, manager, soon):
        d = client_for(viewer).get(URL).data
        assert [t["user"]["id"] for t in d["today"]] == [employee.id]
        assert "wishes" not in d["today"][0]  # only the birthday person sees who wished
    d = client_for(employee).get(URL).data
    assert d["today"][0]["is_me"] is True and d["today"][0]["wishes"] == []
    up = client_for(admin_user).get(URL).data["upcoming"]
    assert [(u["user"]["id"], u["days_until"]) for u in up] == [(soon.id, 3)]
    # The birth year never leaves the server.
    body = str(client_for(admin_user).get(URL).content)
    assert "1994" not in body


def test_opt_out_hides_birthday(employee, admin_user, client_for, at):
    at(WEDNESDAY, "09:00")
    _bday(employee)
    r = client_for(employee).patch("/api/auth/me/", {"show_birthday": False}, format="json")
    assert r.status_code == 200 and r.data["show_birthday"] is False
    assert client_for(admin_user).get(URL).data["today"] == []
    assert client_for(admin_user).post(f"{URL}wishes/", {"to_user": employee.id}, format="json").status_code == 404


def test_wishes(employee, manager, admin_user, client_for, at):
    at(WEDNESDAY, "10:00")
    _bday(employee)
    r = client_for(manager).post(f"{URL}wishes/", {"to_user": employee.id, "message": "Have a great one!"}, format="json")
    assert r.status_code == 201
    # Wishing twice doesn't duplicate; it updates the note.
    client_for(manager).post(f"{URL}wishes/", {"to_user": employee.id, "message": "Have an amazing one!"}, format="json")
    client_for(admin_user).post(f"{URL}wishes/", {"to_user": employee.id}, format="json")
    seen_by_mgr = client_for(manager).get(URL).data["today"][0]
    assert seen_by_mgr["wishes_count"] == 2 and seen_by_mgr["wished_by_me"] is True
    mine = client_for(employee).get(URL).data["today"][0]["wishes"]
    assert {w["from"]["id"] for w in mine} == {manager.id, admin_user.id}
    assert any(w["message"] == "Have an amazing one!" for w in mine)
    # Can't wish yourself, or someone whose birthday isn't today.
    assert client_for(employee).post(f"{URL}wishes/", {"to_user": employee.id}, format="json").status_code == 400
    assert client_for(employee).post(f"{URL}wishes/", {"to_user": manager.id}, format="json").status_code == 404


def test_birth_date_validation_and_privacy_fields(employee, admin_user, client_for, at):
    at(WEDNESDAY, "09:00")
    c = client_for(employee)
    assert c.patch("/api/auth/me/", {"date_of_birth": "2030-01-01"}, format="json").status_code == 400
    assert c.patch("/api/auth/me/", {"date_of_birth": "1880-01-01"}, format="json").status_code == 400
    assert c.patch("/api/auth/me/", {"date_of_birth": "1995-06-15"}, format="json").status_code == 200
    r = client_for(admin_user).patch(f"/api/employees/{employee.id}/", {"date_of_birth": "1995-06-16"}, format="json")
    assert r.status_code == 200 and r.data["date_of_birth"] == "1995-06-16"


def test_poster_upload_admin_only(admin_user, employee, client_for, settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path
    import io

    from PIL import Image

    buf = io.BytesIO()
    Image.new("RGB", (8, 8), (79, 70, 229)).save(buf, format="PNG")
    png = buf.getvalue()
    up = lambda: SimpleUploadedFile("poster.png", png, content_type="image/png")  # noqa: E731
    url = "/api/company/birthday-poster/"
    assert client_for(employee).post(url, {"poster": up()}, format="multipart").status_code == 403
    r = client_for(admin_user).post(url, {"poster": up()}, format="multipart")
    assert r.status_code == 200, r.data
    assert r.data["birthday_poster_url"].endswith(".png")
    assert client_for(employee).get(URL).data["poster_url"]
    assert client_for(admin_user).delete(url).status_code == 204
    assert client_for(employee).get(URL).data["poster_url"] is None


def test_birthday_changes_are_audited(employee, admin_user, client_for):
    from core.models import AuditLog

    client_for(employee).patch("/api/auth/me/", {"date_of_birth": "1995-06-15"}, format="json")
    client_for(admin_user).patch(f"/api/employees/{employee.id}/", {"date_of_birth": "1995-06-16"}, format="json")
    logs = list(AuditLog.objects.filter(target_user=employee).order_by("created_at"))
    assert [l.actor_id for l in logs] == [employee.id, admin_user.id]
    assert "date of birth" in logs[0].message and "date_of_birth" in logs[1].message
    assert "1995" not in str(logs[0].data) + str(logs[1].data)  # the date itself isn't copied
