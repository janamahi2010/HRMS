"""One place for upload rules, so every screen gives the same clear message.

The Supabase bucket rejects files over 3 MB, so nothing larger may be stored. Photos are shrunk in the
browser before upload (and re-encoded on the server), so a normal phone photo still fits.
"""

import os

from rest_framework import serializers

MAX_UPLOAD_MB = 3
MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024

IMAGE_TYPES = {"image/png", "image/jpeg", "image/webp"}  # no SVG (script injection) / GIF
DOCUMENT_TYPES = {
    ".pdf": "application/pdf",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}
# First bytes of each format: the extension alone can't be trusted.
_MAGIC = {".pdf": (b"%PDF",), ".doc": (b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1",), ".docx": (b"PK\x03\x04",)}


def _mb(n: int) -> str:
    return f"{n / (1024 * 1024):.1f} MB"


def too_big(f, what: str = "This file") -> str | None:
    if f.size > MAX_UPLOAD_BYTES:
        return f"{what} is {_mb(f.size)}. The limit is {MAX_UPLOAD_MB} MB, so please choose a smaller one."
    return None


def check_image(f, what: str = "The image") -> None:
    """Raise a friendly ValidationError unless `f` is a JPG/PNG/WebP image of at most 3 MB."""
    ext = os.path.splitext(getattr(f, "name", "") or "")[1].lower()
    if ext in DOCUMENT_TYPES:
        raise serializers.ValidationError(f"{f.name} is a document. Only JPG, PNG or WebP images can be used here.")
    if getattr(f, "content_type", None) not in IMAGE_TYPES:
        raise serializers.ValidationError(f"{getattr(f, 'name', 'This file')}: use a JPG, PNG or WebP image.")
    if msg := too_big(f, what):
        raise serializers.ValidationError(msg)
    # Finally make sure it really is a picture (the content type comes from the browser).
    from PIL import Image

    try:
        with Image.open(f) as im:
            im.verify()
    except Exception:  # noqa: BLE001 - any decode problem means a bad file
        raise serializers.ValidationError(f"{getattr(f, 'name', 'This file')} couldn't be read as an image.")
    finally:
        f.seek(0)


def check_document(f) -> str:
    """Validate a PDF / Word upload (type, real contents, 3 MB). Returns the clean content type."""
    name = getattr(f, "name", "") or ""
    ext = os.path.splitext(name)[1].lower()
    if ext not in DOCUMENT_TYPES:
        raise serializers.ValidationError(f"{name or 'This file'}: only PDF or Word (.doc, .docx) files can be attached.")
    if msg := too_big(f, name):
        raise serializers.ValidationError(msg)
    head = f.read(8)
    f.seek(0)
    if not any(head.startswith(m) for m in _MAGIC[ext]):
        raise serializers.ValidationError(f"{name} doesn't look like a real {ext[1:].upper()} file.")
    return DOCUMENT_TYPES[ext]


def media_url(file, request=None) -> str | None:
    """Absolute URL for a stored file (Supabase links are already absolute)."""
    if not file:
        return None
    try:
        url = file.url
    except ValueError:
        return None
    return request.build_absolute_uri(url) if request and not url.startswith("http") else url
