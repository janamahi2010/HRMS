from datetime import date, timedelta
from decimal import Decimal

import pytest

from attendance.models import Attendance
from company.models import Holiday
from company.services import get_settings
from conftest import WEDNESDAY
from core.constants import Role
from leaves.models import LeaveBalance, LeaveType
from leaves.services import credit_balances_for_user, prorated_quota

pytestmark = pytest.mark.django_db
URL = "/api/leave/requests/"


@pytest.fixture
def casual(company):
    return LeaveType.objects.get(company=company, name="Casual Leave")


@pytest.fixture
def team(employee, manager, admin_user, at):
    at(WEDNESDAY, "10:00")
    for u in (employee, manager, admin_user):
        credit_balances_for_user(u, 2026)
    return employee, manager, admin_user


def bal(user, lt):
    return LeaveBalance.objects.get(user=user, leave_type=lt, year=2026)


def apply(client, lt, start, end, **kw):
    return client.post(URL, {"leave_type": lt.id, "from_date": str(start), "to_date": str(end), "reason": "Family function", **kw}, format="json")


def test_prorata():
    assert prorated_quota(Decimal("12"), date(2026, 7, 10), 2026) == Decimal("6")  # Jul counts -> 6 months
    assert prorated_quota(Decimal("12"), date(2026, 7, 20), 2026) == Decimal("5")
    assert prorated_quota(Decimal("15"), date(2026, 7, 20), 2026) == Decimal("6")  # 6.25 -> 6.0
    assert prorated_quota(Decimal("12"), date(2025, 3, 1), 2026) == Decimal("12")


def test_preview_excludes_weekends_and_holidays(team, casual, client_for):
    emp = team[0]
    fri = WEDNESDAY + timedelta(days=9)  # Fri 20 Nov
    Holiday.objects.create(company=emp.company, date=fri + timedelta(days=3), name="Holiday")  # Mon
    r = client_for(emp).post(
        "/api/leave/preview/",
        {"leave_type": casual.id, "from_date": str(fri), "to_date": str(fri + timedelta(days=4))},
        format="json",
    )
    assert r.status_code == 200
    assert r.data["days"] == 2  # Fri + Tue (Sat/Sun off, Mon holiday)
    assert [d["kind"] for d in r.data["breakdown"]] == ["working", "weekly_off", "weekly_off", "holiday", "working"]
    assert r.data["balance"]["after"] == 10 and r.data["issues"] == []


def test_apply_books_balance_and_reject_restores(team, casual, client_for):
    emp, mgr, admin = team
    start = WEDNESDAY + timedelta(days=5)  # Mon
    r = apply(client_for(emp), casual, start, start + timedelta(days=2))
    assert r.status_code == 201, r.data
    assert r.data["days"] == "3.0" and r.data["approver"]["id"] == mgr.id
    assert bal(emp, casual).used == 3
    r = client_for(mgr).post(f"{URL}{r.data['id']}/reject/", {"comment": "Release week"}, format="json")
    assert r.data["status"] == "rejected"
    assert bal(emp, casual).used == 0


def test_balance_overlap_and_half_day_rules(team, casual, client_for, company):
    emp = team[0]
    c = client_for(emp)
    mon = WEDNESDAY + timedelta(days=5)
    r = apply(c, casual, mon, mon + timedelta(days=30))
    assert r.data["error"]["code"] == "insufficient_balance" and r.data["error"]["field"] == "leave_type"
    assert apply(c, casual, mon, mon).status_code == 201
    assert apply(c, casual, mon, mon + timedelta(days=1)).data["error"]["code"] == "overlap"
    tue = mon + timedelta(days=1)
    assert apply(c, casual, tue, tue, is_half_day=True, half="first").status_code == 201
    assert apply(c, casual, tue, tue, is_half_day=True, half="second").status_code == 201  # other session OK
    assert bal(emp, casual).used == 2
    earned = LeaveType.objects.get(company=company, name="Earned Leave")
    r = apply(c, earned, tue + timedelta(days=1), tue + timedelta(days=1), is_half_day=True, half="first")
    assert r.data["error"]["code"] == "half_day_not_allowed"
    sat = WEDNESDAY + timedelta(days=3)
    assert apply(c, casual, sat, sat + timedelta(days=1)).data["error"]["code"] == "no_working_days"


def test_unpaid_never_blocks(team, client_for, company):
    unpaid = LeaveType.objects.get(company=company, name="Unpaid Leave")
    mon = WEDNESDAY + timedelta(days=5)
    assert apply(client_for(team[0]), unpaid, mon, mon + timedelta(days=4)).status_code == 201


def test_cc_default_and_view_only(team, casual, client_for, make_user):
    emp, mgr, admin = team
    hr = make_user("hr@test.co")
    cfg = get_settings(emp.company_id)
    cfg.default_cc.set([admin])
    mon = WEDNESDAY + timedelta(days=5)
    r = apply(client_for(emp), casual, mon, mon, cc_ids=[hr.id, emp.id, mgr.id])
    ccs = {u["id"] for u in r.data["cc_users"]}
    assert ccs == {hr.id, admin.id}  # self + approver dropped, default added
    rid = r.data["id"]
    hr_view = client_for(hr).get(URL, {"scope": "cc"}).data
    assert hr_view["count"] == 1 and hr_view["results"][0]["is_cc"] and not hr_view["results"][0]["can_decide"]
    assert client_for(hr).get(f"{URL}{rid}/").status_code == 200
    assert client_for(hr).post(f"{URL}{rid}/approve/", format="json").status_code == 403
    other = make_user("other@test.co")
    assert client_for(other).get(f"{URL}{rid}/").status_code == 404
    assert apply(client_for(emp), casual, mon + timedelta(days=1), mon + timedelta(days=1), cc_ids=[99999]).data["error"]["code"] == "invalid_cc"


def test_cancel_rules(team, casual, client_for, at):
    emp, mgr, _ = team
    c = client_for(emp)
    mon = WEDNESDAY + timedelta(days=5)
    rid = apply(c, casual, mon, mon).data["id"]
    client_for(mgr).post(f"{URL}{rid}/approve/", format="json")
    assert bal(emp, casual).used == 1
    at(mon, "09:00")  # leave has started
    r = c.post(f"{URL}{rid}/cancel/", format="json")
    assert r.status_code == 409 and r.data["error"]["code"] == "already_started"
    at(WEDNESDAY, "10:00")
    r = c.post(f"{URL}{rid}/cancel/", format="json")
    assert r.data["status"] == "cancelled" and bal(emp, casual).used == 0


def test_backdated_approval_converts_absent(team, casual, client_for):
    emp, mgr, _ = team
    mon = WEDNESDAY - timedelta(days=2)
    Attendance.objects.create(company=emp.company, user=emp, date=mon, status="absent", source="system")
    rid = apply(client_for(emp), casual, mon, mon).data["id"]
    client_for(mgr).post(f"{URL}{rid}/approve/", format="json")
    assert Attendance.objects.get(user=emp, date=mon).status == "on_leave"


def test_cannot_take_leave_on_punched_day(team, casual, client_for):
    emp = team[0]
    Attendance.objects.create(company=emp.company, user=emp, date=WEDNESDAY, status="present", check_in_at="2026-11-11T04:00:00Z")
    assert apply(client_for(emp), casual, WEDNESDAY, WEDNESDAY).data["error"]["code"] == "attendance_exists"


def test_manager_leave_goes_to_admin(team, casual, client_for, make_user):
    emp, mgr, admin = team
    r = apply(client_for(mgr), casual, WEDNESDAY + timedelta(days=5), WEDNESDAY + timedelta(days=5))
    assert r.data["approver"]["id"] == admin.id
    assert client_for(mgr).post(f"{URL}{r.data['id']}/approve/", format="json").status_code == 403
    make_user("admin2@test.co", Role.ADMIN)
    assert client_for(admin).post(f"{URL}{r.data['id']}/approve/", format="json").data["status"] == "approved"


def test_adjust_balance_audited(team, casual, client_for):
    emp, mgr, admin = team
    url = "/api/leave/balances/adjust/"
    body = {"user": emp.id, "leave_type": casual.id, "year": 2026, "delta": "2", "reason": "Comp-off for weekend release"}
    assert client_for(mgr).post(url, body, format="json").status_code == 403
    r = client_for(admin).post(url, body, format="json")
    assert r.status_code == 200 and r.data["total"] == "14.0"
    r = client_for(admin).post(url, {**body, "delta": "-20"}, format="json")
    assert r.data["error"]["code"] == "invalid_delta"
    r = client_for(admin).post(url, {**body, "delta": "0.3"}, format="json")
    assert r.status_code == 400
    hist = client_for(admin).get("/api/leave/balances/adjustments/", {"user": emp.id}).data
    assert len(hist) == 1 and "12.0 → 14.0" in hist[0]["message"]


def test_balances_scoping_and_overview(team, client_for, make_user):
    emp, mgr, admin = team
    assert len(client_for(emp).get("/api/leave/balances/").data) == 4
    assert client_for(emp).get("/api/leave/balances/", {"user": mgr.id}).status_code == 404
    assert client_for(mgr).get("/api/leave/balances/", {"user": emp.id}).status_code == 200
    ov = client_for(admin).get("/api/leave/balances/overview/").data
    assert ov["count"] == 3 and len(ov["types"]) == 4


def test_on_leave_and_team_calendar(team, casual, client_for, make_user):
    emp, mgr, admin = team
    rid = apply(client_for(emp), casual, WEDNESDAY + timedelta(days=1), WEDNESDAY + timedelta(days=1)).data["id"]
    client_for(mgr).post(f"{URL}{rid}/approve/", format="json")
    r = client_for(admin).get("/api/leave/on-leave/", {"date": str(WEDNESDAY + timedelta(days=1))})
    assert [x["user"]["id"] for x in r.data["results"]] == [emp.id]
    outsider = make_user("x@test.co", manager=admin)
    cal = client_for(emp).get("/api/leave/calendar/", {"year": 2026, "month": 11}).data
    member_ids = {m["id"] for m in cal["members"]}
    assert emp.id in member_ids and mgr.id in member_ids and outsider.id not in member_ids
    assert len(cal["leaves"]) == 1


def test_leave_type_admin(team, client_for, casual):
    emp, mgr, admin = team
    assert client_for(emp).post("/api/leave/types/", {"name": "WFH Day"}, format="json").status_code == 403
    r = client_for(admin).post("/api/leave/types/", {"name": "Comp Off", "yearly_quota": "2", "color": "#f59e0b"}, format="json")
    assert r.status_code == 201
    assert LeaveBalance.objects.filter(leave_type_id=r.data["id"]).count() == 3  # credited to everyone
    assert client_for(admin).post("/api/leave/types/", {"name": "comp off"}, format="json").status_code == 400
    apply(client_for(emp), casual, WEDNESDAY + timedelta(days=5), WEDNESDAY + timedelta(days=5))
    r = client_for(admin).delete(f"/api/leave/types/{casual.id}/")
    assert r.status_code == 409 and r.data["error"]["code"] == "in_use"
