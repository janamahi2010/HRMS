import io

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image

from news.models import NewsImage, NewsPost

pytestmark = pytest.mark.django_db
URL = "/api/news/"


def photo(name="p.jpg", size=(3000, 1500), fmt="JPEG", ctype="image/jpeg", exif_gps=False):
    buf = io.BytesIO()
    img = Image.new("RGB", size, (79, 70, 229))
    kw = {}
    if exif_gps:
        exif = Image.Exif()
        exif[0x8825] = {2: (12.0, 58.0, 0.0)}  # GPSInfo
        kw["exif"] = exif
    img.save(buf, format=fmt, **kw)
    return SimpleUploadedFile(name, buf.getvalue(), content_type=ctype)


@pytest.fixture(autouse=True)
def media(settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path
    return tmp_path


def test_admin_posts_with_photos_and_everyone_reads(admin_user, employee, client_for):
    r = client_for(admin_user).post(
        URL,
        {"title": "MoU signed with ABC University", "body": "Internships for 20 students.", "category": "mou",
         "event_date": "2026-11-10", "new_images": [photo(exif_gps=True), photo("b.png", (400, 300), "PNG", "image/png")]},
        format="multipart",
    )
    assert r.status_code == 201, r.data
    assert r.data["category_label"] == "MoU / partnership" and r.data["author"]["id"] == admin_user.id
    assert len(r.data["images"]) == 2
    first = NewsImage.objects.get(id=r.data["images"][0]["id"])
    # Re-encoded: capped to 2000 px, GPS / EXIF stripped
    assert (first.width, first.height) == (2000, 1000)
    with Image.open(first.image.path) as im:
        assert not im.getexif().get(0x8825)
    feed = client_for(employee).get(URL).data
    assert feed["count"] == 1 and feed["results"][0]["title"].startswith("MoU")


def test_only_admins_write(employee, client_for):
    r = client_for(employee).post(URL, {"title": "Hello there", "body": "x"}, format="multipart")
    assert r.status_code == 403


def test_validation(admin_user, client_for):
    c = client_for(admin_user)
    assert c.post(URL, {"title": "Hi", "body": "x"}, format="multipart").status_code == 400  # short title
    assert c.post(URL, {"title": "No content"}, format="multipart").status_code == 400  # needs text or photo
    bad = SimpleUploadedFile("x.jpg", b"not an image", content_type="image/jpeg")
    assert c.post(URL, {"title": "Bad photo", "new_images": [bad]}, format="multipart").status_code == 400
    svg = SimpleUploadedFile("x.svg", b"<svg/>", content_type="image/svg+xml")
    assert c.post(URL, {"title": "SVG photo", "new_images": [svg]}, format="multipart").status_code == 400
    many = [photo(f"{i}.jpg", (50, 50)) for i in range(7)]
    assert c.post(URL, {"title": "Too many", "new_images": many}, format="multipart").status_code == 400


def test_edit_remove_photo_pin_and_delete(admin_user, client_for, media, django_capture_on_commit_callbacks):
    c = client_for(admin_user)
    old = c.post(URL, {"title": "Older post", "body": "a"}, format="multipart").data
    p = c.post(URL, {"title": "Annual day", "body": "Fun", "category": "event", "new_images": [photo(), photo("2.jpg")]}, format="multipart").data
    keep, drop = p["images"]
    path = NewsImage.objects.get(id=drop["id"]).image.path
    with django_capture_on_commit_callbacks(execute=True):
        r = c.patch(f"{URL}{p['id']}/", {"remove_image_ids": [drop["id"]], "new_images": [photo("3.jpg", (100, 100))]}, format="multipart")
    assert r.status_code == 200 and [i["id"] for i in r.data["images"]][0] == keep["id"] and len(r.data["images"]) == 2
    import os

    assert not os.path.exists(path)  # file removed from storage
    # Pinned posts come first
    c.patch(f"{URL}{old['id']}/", {"is_pinned": True}, format="json")
    assert [x["id"] for x in c.get(URL).data["results"]] == [old["id"], p["id"]]
    assert c.get(URL, {"category": "event"}).data["count"] == 1
    assert c.delete(f"{URL}{p['id']}/").status_code == 204
    assert not NewsImage.objects.filter(post_id=p["id"]).exists()


def test_other_company_cannot_see(admin_user, client_for):
    from accounts.models import User
    from company.models import Company

    client_for(admin_user).post(URL, {"title": "Internal news", "body": "secret"}, format="multipart")
    other = Company.objects.create(name="Other")
    outsider = User.objects.create_user(email="o@other.co", password="x", name="O", company=other, role="admin")
    c = client_for(outsider)
    assert c.get(URL).data["count"] == 0
    assert c.get(f"{URL}{NewsPost.objects.get().id}/").status_code == 404


# ---------------------------------------------------------------- notifications

def test_unread_count_and_seen(admin_user, employee, client_for, at):
    from datetime import timedelta

    from django.utils import timezone

    from accounts.models import User

    User.objects.filter(pk=employee.pk).update(created_at=timezone.now() - timedelta(days=30))
    a, e = client_for(admin_user), client_for(employee)
    assert e.get(f"{URL}unread/").data == {"count": 0, "latest": None}
    a.post(URL, {"title": "First news", "body": "x"}, format="multipart")
    a.post(URL, {"title": "Second news", "body": "y"}, format="multipart")
    r = e.get(f"{URL}unread/").data
    assert r["count"] == 2 and r["latest"]["title"] == "Second news"
    assert a.get(f"{URL}unread/").data["count"] == 0  # your own posts are never "new" for you
    assert e.post(f"{URL}seen/").status_code == 204  # any role may mark as seen
    assert e.get(f"{URL}unread/").data["count"] == 0


def test_email_everyone_only_when_asked(admin_user, employee, manager, client_for, mailoutbox, django_capture_on_commit_callbacks):
    c = client_for(admin_user)
    with django_capture_on_commit_callbacks(execute=True):
        c.post(URL, {"title": "Quiet post", "body": "x"}, format="multipart")
    assert len(mailoutbox) == 0
    with django_capture_on_commit_callbacks(execute=True):
        c.post(URL, {"title": "MoU with ABC", "body": "Signed today.", "category": "mou", "email_everyone": True,
                     "new_images": [photo()]}, format="multipart")
    to = sorted(m.to[0] for m in mailoutbox)
    assert admin_user.email not in to and employee.email in to and manager.email in to
    m = mailoutbox[0]
    html = m.alternatives[0][0]
    assert "MoU with ABC" in m.subject and "/news#post-" in html and "/media/news/" in html
    # Editing never re-sends
    pid = c.get(URL).data["results"][0]["id"]
    with django_capture_on_commit_callbacks(execute=True):
        c.patch(f"{URL}{pid}/", {"title": "MoU with ABC Univ", "email_everyone": True}, format="multipart")
    assert len(mailoutbox) == len(to)
