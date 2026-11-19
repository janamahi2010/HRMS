from django.db import IntegrityError
from rest_framework import serializers

from accounts.models import User
from accounts.serializers import CompanyMiniSerializer

from .models import Company, CompanySettings, Holiday, OfficeLocation

MAX_LOGO_BYTES = 2 * 1024 * 1024
ALLOWED_LOGO_TYPES = {"image/png", "image/jpeg", "image/webp"}  # no SVG: script-injection risk


class CompanySerializer(CompanyMiniSerializer):
    class Meta(CompanyMiniSerializer.Meta):
        model = Company
        fields = ("id", "name", "logo_url", "birthday_poster_url")

    birthday_poster_url = serializers.SerializerMethodField()

    def get_birthday_poster_url(self, obj) -> str | None:
        from accounts.celebrations import poster_url

        return poster_url(obj, self.context.get("request"))

    def validate_name(self, value: str) -> str:
        value = value.strip()
        if len(value) < 2:
            raise serializers.ValidationError("Company name is too short.")
        return value


MAX_POSTER_BYTES = 5 * 1024 * 1024


class PosterUploadSerializer(serializers.Serializer):
    poster = serializers.ImageField()

    def validate_poster(self, f):
        if f.size > MAX_POSTER_BYTES:
            raise serializers.ValidationError("Poster must be 5 MB or smaller.")
        if getattr(f, "content_type", None) not in ALLOWED_LOGO_TYPES:
            raise serializers.ValidationError("Use a PNG, JPG or WebP image.")
        return f


class LogoUploadSerializer(serializers.Serializer):
    logo = serializers.ImageField()

    def validate_logo(self, f):
        if f.size > MAX_LOGO_BYTES:
            raise serializers.ValidationError("Logo must be 2 MB or smaller.")
        if getattr(f, "content_type", None) not in ALLOWED_LOGO_TYPES:
            raise serializers.ValidationError("Use a PNG, JPG or WebP image.")
        return f


class CCUserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ("id", "name", "email", "designation")


class CompanySettingsSerializer(serializers.ModelSerializer):
    default_cc = serializers.PrimaryKeyRelatedField(many=True, queryset=User.objects.none(), required=False)
    default_cc_users = CCUserSerializer(source="default_cc", many=True, read_only=True)
    backup_approver = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.none(), allow_null=True, required=False,
        error_messages={"does_not_exist": "Choose an active admin."},
    )
    backup_approver_user = CCUserSerializer(source="backup_approver", read_only=True)
    office_start = serializers.TimeField(format="%H:%M")
    office_end = serializers.TimeField(format="%H:%M")
    late_after = serializers.TimeField(format="%H:%M")
    weekly_offs = serializers.ListField(child=serializers.IntegerField(min_value=0, max_value=6), allow_empty=True)

    class Meta:
        model = CompanySettings
        fields = (
            "office_start",
            "office_end",
            "late_after",
            "half_day_hours",
            "weekly_offs",
            "work_summary_required",
            "default_cc",
            "default_cc_users",
            "backup_approver",
            "backup_approver_user",
        )

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        if request and request.user.is_authenticated:
            self.fields["default_cc"].child_relation.queryset = User.objects.filter(
                company_id=request.user.company_id, is_active=True
            )
            self.fields["backup_approver"].queryset = User.objects.filter(
                company_id=request.user.company_id, is_active=True, role="admin"
            )

    def validate_weekly_offs(self, value):
        value = sorted(set(value))
        if len(value) >= 7:
            raise serializers.ValidationError("At least one working day is required.")
        return value

    def validate(self, attrs):
        start = attrs.get("office_start", getattr(self.instance, "office_start", None))
        end = attrs.get("office_end", getattr(self.instance, "office_end", None))
        late = attrs.get("late_after", getattr(self.instance, "late_after", None))
        if start and end and end <= start:
            raise serializers.ValidationError({"office_end": "Office end must be after office start."})
        if start and end and late and not (start <= late < end):
            raise serializers.ValidationError({"late_after": "Late-after time must be within office hours."})
        return attrs


class OfficeLocationSerializer(serializers.ModelSerializer):
    employee_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = OfficeLocation
        fields = ("id", "name", "address", "latitude", "longitude", "radius_m", "is_active", "employee_count")

    def validate_name(self, value):
        value = value.strip()
        request = self.context["request"]
        qs = OfficeLocation.objects.filter(company_id=request.user.company_id, name__iexact=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("A location with this name already exists.")
        return value

    def to_internal_value(self, data):
        # Accept full-precision floats from the map; store 6 decimals (~11 cm).
        data = data.copy() if hasattr(data, "copy") else dict(data)
        for key in ("latitude", "longitude"):
            if data.get(key) not in (None, ""):
                try:
                    data[key] = f"{float(data[key]):.6f}"
                except (TypeError, ValueError):
                    pass
        return super().to_internal_value(data)


class HolidaySerializer(serializers.ModelSerializer):
    class Meta:
        model = Holiday
        fields = ("id", "date", "name")

    def validate(self, attrs):
        request = self.context["request"]
        d = attrs.get("date", getattr(self.instance, "date", None))
        qs = Holiday.objects.filter(company_id=request.user.company_id, date=d)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError({"date": "There's already a holiday on this date."})
        return attrs

    def save(self, **kwargs):
        try:
            return super().save(**kwargs)
        except IntegrityError as exc:  # race with a concurrent insert
            raise serializers.ValidationError({"date": "There's already a holiday on this date."}) from exc
