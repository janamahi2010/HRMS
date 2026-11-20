from django.db import transaction
from rest_framework import serializers

import os
import uuid

from django.utils.text import get_valid_filename

from core.uploads import check_document, check_image

from .images import clean_photo
from .models import NewsAttachment, NewsImage, NewsPost

MAX_IMAGES = 6
MAX_FILES = 3
MAX_BODY = 5000


def delete_files(names):
    from django.core.files.storage import default_storage

    for n in names:
        try:
            default_storage.delete(n)
        except Exception:  # noqa: BLE001 - a missing file is fine
            pass


class NewsImageSerializer(serializers.ModelSerializer):
    url = serializers.SerializerMethodField()

    class Meta:
        model = NewsImage
        fields = ("id", "url", "width", "height")

    def get_url(self, obj) -> str:
        url = obj.image.url
        request = self.context.get("request")
        return request.build_absolute_uri(url) if request and not url.startswith("http") else url


class NewsAttachmentSerializer(serializers.ModelSerializer):
    url = serializers.SerializerMethodField()

    class Meta:
        model = NewsAttachment
        fields = ("id", "name", "size", "content_type", "url")

    def get_url(self, obj) -> str:
        url = obj.file.url
        request = self.context.get("request")
        return request.build_absolute_uri(url) if request and not url.startswith("http") else url


class NewsPostSerializer(serializers.ModelSerializer):
    """Read + write. New photos come as repeated multipart `new_images`; `remove_image_ids` drops existing ones."""

    author = serializers.SerializerMethodField()
    images = NewsImageSerializer(many=True, read_only=True)
    attachments = NewsAttachmentSerializer(many=True, read_only=True)
    new_files = serializers.ListField(child=serializers.FileField(), write_only=True, required=False, max_length=MAX_FILES)
    remove_file_ids = serializers.ListField(child=serializers.IntegerField(), write_only=True, required=False)
    category_label = serializers.CharField(source="get_category_display", read_only=True)
    new_images = serializers.ListField(child=serializers.FileField(), write_only=True, required=False, max_length=MAX_IMAGES)
    remove_image_ids = serializers.ListField(child=serializers.IntegerField(), write_only=True, required=False)
    # Create only: also email everyone in the company.
    email_everyone = serializers.BooleanField(write_only=True, required=False, default=False)

    class Meta:
        model = NewsPost
        fields = (
            "id",
            "title",
            "body",
            "category",
            "category_label",
            "event_date",
            "is_pinned",
            "author",
            "images",
            "new_images",
            "remove_image_ids",
            "attachments",
            "new_files",
            "remove_file_ids",
            "email_everyone",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")
        extra_kwargs = {"event_date": {"required": False, "allow_null": True}, "body": {"required": False}}

    def get_author(self, obj) -> dict | None:
        a = obj.author
        if not a:
            return None
        from core.uploads import media_url

        return {"id": a.id, "name": a.name, "designation": a.designation, "avatar_url": media_url(a.avatar, self.context.get("request"))}

    def validate_title(self, v):
        v = v.strip()
        if len(v) < 3:
            raise serializers.ValidationError("Add a title (at least 3 characters).")
        return v

    def validate_body(self, v):
        v = (v or "").strip()
        if len(v) > MAX_BODY:
            raise serializers.ValidationError(f"Keep the description under {MAX_BODY} characters.")
        return v

    def validate_new_images(self, files):
        out = []
        for f in files:
            check_image(f, f.name)
            try:
                out.append(clean_photo(f))
            except Exception:  # noqa: BLE001 - any decode problem means a bad file
                raise serializers.ValidationError(f"{f.name} couldn't be read as an image.")
        return out

    def validate_new_files(self, files):
        out = []
        for f in files:
            ctype = check_document(f)
            out.append((f, ctype))
        return out

    def validate(self, attrs):
        inst = self.instance
        files_in = len(attrs.get("new_files", []))
        files_out = set(attrs.get("remove_file_ids", []))
        files_kept = inst.attachments.exclude(id__in=files_out).count() if inst else 0
        if files_kept + files_in > MAX_FILES:
            raise serializers.ValidationError({"new_files": f"A post can have at most {MAX_FILES} documents."})
        adding = len(attrs.get("new_images", []))
        removing = set(attrs.get("remove_image_ids", []))
        keeping = inst.images.exclude(id__in=removing).count() if inst else 0
        if keeping + adding > MAX_IMAGES:
            raise serializers.ValidationError({"new_images": f"A post can have at most {MAX_IMAGES} photos."})
        body = attrs.get("body", inst.body if inst else "")
        if not body and keeping + adding == 0 and files_kept + files_in == 0:
            raise serializers.ValidationError({"body": "Add a description or at least one photo."})
        return attrs

    @transaction.atomic
    def create(self, validated):
        photos = validated.pop("new_images", [])
        docs = validated.pop("new_files", [])
        validated.pop("remove_image_ids", None)
        validated.pop("remove_file_ids", None)
        validated.pop("email_everyone", None)
        post = NewsPost.objects.create(**validated)
        self._add_photos(post, photos)
        self._add_files(post, docs)
        return post

    @transaction.atomic
    def update(self, inst, validated):
        photos = validated.pop("new_images", [])
        remove = validated.pop("remove_image_ids", [])
        docs = validated.pop("new_files", [])
        remove_docs = validated.pop("remove_file_ids", [])
        validated.pop("email_everyone", None)
        for k, v in validated.items():
            setattr(inst, k, v)
        inst.save()
        doomed = list(inst.images.filter(id__in=remove))
        names = [img.image.name for img in doomed]
        NewsImage.objects.filter(id__in=[i.id for i in doomed]).delete()
        gone = list(inst.attachments.filter(id__in=remove_docs))
        names += [a.file.name for a in gone]
        NewsAttachment.objects.filter(id__in=[a.id for a in gone]).delete()
        transaction.on_commit(lambda: delete_files(names))
        self._add_photos(inst, photos)
        self._add_files(inst, docs)
        return inst

    @staticmethod
    def _add_files(post, docs):
        for f, ctype in docs:
            original = os.path.basename(f.name)[:150]
            safe = get_valid_filename(original)[:100] or "document"
            # Own folder per file keeps the real name in the link (nice downloads) without clashes.
            f.name = f"{uuid.uuid4().hex[:12]}/{safe}"
            NewsAttachment.objects.create(post=post, file=f, name=original, size=f.size, content_type=ctype)

    @staticmethod
    def _add_photos(post, photos):
        last = post.images.order_by("-position").values_list("position", flat=True).first()
        start = (last or 0) + 1
        for i, (f, w, h) in enumerate(photos):
            NewsImage.objects.create(post=post, image=f, width=w, height=h, position=start + i)
