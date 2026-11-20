"""Clean uploaded photos: fix rotation, cap the size and drop metadata (phone photos carry GPS)."""

import io
import uuid

from django.core.files.uploadedfile import InMemoryUploadedFile
from PIL import Image, ImageOps

MAX_SIDE = 2000
Image.MAX_IMAGE_PIXELS = 60_000_000  # refuse decompression bombs early


def clean_avatar(f, side: int = 400) -> InMemoryUploadedFile:
    """Square, centre-cropped profile photo (EXIF/GPS stripped), ~30-60 KB."""
    img = Image.open(f)
    img.load()
    img = ImageOps.exif_transpose(img).convert("RGB")
    img = ImageOps.fit(img, (side, side), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85, optimize=True, progressive=True)
    size = buf.tell()
    buf.seek(0)
    return InMemoryUploadedFile(buf, "avatar", f"{uuid.uuid4().hex}.jpg", "image/jpeg", size, None)


def clean_photo(f) -> tuple[InMemoryUploadedFile, int, int]:
    """Re-encode the upload (strips EXIF/GPS and anything hidden in the file). Returns (file, width, height)."""
    img = Image.open(f)
    img.load()
    img = ImageOps.exif_transpose(img)
    img.thumbnail((MAX_SIDE, MAX_SIDE), Image.LANCZOS)
    has_alpha = img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info)
    buf = io.BytesIO()
    if has_alpha:
        img = img.convert("RGBA")
        img.save(buf, format="WEBP", quality=88, method=4)
        ext, ctype = "webp", "image/webp"
    else:
        img = img.convert("RGB")
        img.save(buf, format="JPEG", quality=85, optimize=True, progressive=True)
        ext, ctype = "jpg", "image/jpeg"
    size = buf.tell()
    buf.seek(0)
    return InMemoryUploadedFile(buf, "image", f"{uuid.uuid4().hex}.{ext}", ctype, size, None), img.width, img.height
