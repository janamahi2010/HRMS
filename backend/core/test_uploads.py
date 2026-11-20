import io

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image

from news.models import NewsAttachment

pytestmark = pytest.mark.django_db


def png(size=(64, 64), name="p.png"):
    buf = io.BytesIO()
    Image.new("RGB", size, (79, 70, 229)).save(buf, format="PNG")
    return SimpleUploadedFile(name, buf.getvalue(), content_type="image/png")


def big(name="big.png", ctype="image/png", mb=3.2):
    return SimpleUploadedFile(name, b"\x89PNG" + b"0" * int(mb * 1024 * 1024), content_type=ctype)


PDF = b"%PDF-1.4\n%fake but valid header\n" + b"0" * 1000
DOCX = b"PK\x03\x04" + b"0" * 1000


# ---------------------------------------------------------------- 3 MB everywhere

def test_logo_and_poster_over_3mb_get_a_clear_message(admin_user, client_for):
    c = client_for(admin_user)
    r = c.post("/api/company/logo/", {"logo": big()}, format="multipart")
    assert r.status_code == 400 and "The limit is 3 MB" in str(r.data)
    r = c.post("/api/company/birthday-poster/", {"poster": big()}, format="multipart")
    assert r.status_code == 400 and "The limit is 3 MB" in str(r.data)


def test_documents_are_refused_where_only_images_fit(admin_user, client_for):
    pdf = SimpleUploadedFile("mou.pdf", PDF, content_type="application/pdf")
    r = client_for(admin_user).post("/api/company/logo/", {"logo": pdf}, format="multipart")
    assert r.status_code == 400 and "Only JPG, PNG or WebP images" in str(r.data)


# ---------------------------------------------------------------- news documents

def test_news_with_pdf_and_word_attachments(admin_user, employee, client_for, django_capture_on_commit_callbacks):
    c = client_for(admin_user)
    r = c.post("/api/news/", {
        "title": "MoU signed with ABC University", "body": "Copy attached.",
        "new_files": [SimpleUploadedFile("MoU ABC 2026.pdf", PDF, content_type="application/pdf"),
                      SimpleUploadedFile("Minutes.docx", DOCX, content_type="application/octet-stream")],
    }, format="multipart")
    assert r.status_code == 201, r.data
    files = r.data["attachments"]
    assert [f["name"] for f in files] == ["MoU ABC 2026.pdf", "Minutes.docx"]
    assert files[0]["content_type"] == "application/pdf" and files[0]["url"].endswith(".pdf")
    # Everyone sees them
    assert len(client_for(employee).get("/api/news/").data["results"][0]["attachments"]) == 2
    # Remove one when editing; deleting the post removes the rest
    pid = r.data["id"]
    r = c.patch(f"/api/news/{pid}/", {"remove_file_ids": [files[1]["id"]]}, format="multipart")
    assert [f["name"] for f in r.data["attachments"]] == ["MoU ABC 2026.pdf"]
    with django_capture_on_commit_callbacks(execute=True):
        c.delete(f"/api/news/{pid}/")
    assert not NewsAttachment.objects.exists()


def test_news_documents_are_checked(admin_user, client_for):
    c = client_for(admin_user)
    fake = SimpleUploadedFile("virus.pdf", b"MZ\x90\x00 not a pdf", content_type="application/pdf")
    r = c.post("/api/news/", {"title": "Bad file", "new_files": [fake]}, format="multipart")
    assert r.status_code == 400 and "doesn't look like a real PDF" in str(r.data)
    exe = SimpleUploadedFile("tool.exe", b"MZ", content_type="application/octet-stream")
    r = c.post("/api/news/", {"title": "Bad file", "new_files": [exe]}, format="multipart")
    assert r.status_code == 400 and "only PDF or Word" in str(r.data)
    huge = SimpleUploadedFile("big.pdf", b"%PDF" + b"0" * int(3.1 * 1024 * 1024), content_type="application/pdf")
    r = c.post("/api/news/", {"title": "Big file", "new_files": [huge]}, format="multipart")
    assert r.status_code == 400 and "The limit is 3 MB" in str(r.data)
    many = [SimpleUploadedFile(f"{i}.pdf", PDF, content_type="application/pdf") for i in range(4)]
    assert c.post("/api/news/", {"title": "Too many", "new_files": many}, format="multipart").status_code == 400
    # A post may be just a document (no text, no photo)
    one = SimpleUploadedFile("only.pdf", PDF, content_type="application/pdf")
    assert c.post("/api/news/", {"title": "Holiday list 2027", "new_files": [one]}, format="multipart").status_code == 201


# ---------------------------------------------------------------- profile photos

def test_everyone_can_set_and_remove_their_photo(employee, manager, client_for, django_capture_on_commit_callbacks):
    c = client_for(employee)
    r = c.post("/api/auth/me/avatar/", {"avatar": png((1200, 800))}, format="multipart")
    assert r.status_code == 200 and r.data["avatar_url"]
    employee.refresh_from_db()
    with Image.open(employee.avatar.path) as im:
        assert im.size == (400, 400)  # square, small
    # Visible to others (e.g. in their manager's view of the team)
    lookup = client_for(manager).get("/api/users/lookup/", {"search": "emp"}).data
    rows = lookup["results"] if isinstance(lookup, dict) else lookup
    assert any(u["avatar_url"] for u in rows if u["id"] == employee.id)
    # Replace: the old file is removed
    old = employee.avatar.path
    with django_capture_on_commit_callbacks(execute=True):
        c.post("/api/auth/me/avatar/", {"avatar": png()}, format="multipart")
    import os

    assert not os.path.exists(old)
    assert c.delete("/api/auth/me/avatar/").data["avatar_url"] is None


def test_photo_rules(employee, client_for):
    c = client_for(employee)
    assert "The limit is 3 MB" in str(c.post("/api/auth/me/avatar/", {"avatar": big()}, format="multipart").data)
    pdf = SimpleUploadedFile("cv.pdf", PDF, content_type="application/pdf")
    assert "Only JPG, PNG or WebP images" in str(c.post("/api/auth/me/avatar/", {"avatar": pdf}, format="multipart").data)
