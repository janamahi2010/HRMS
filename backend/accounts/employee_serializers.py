"""Serializers for admin employee management and the user lookup used by pickers."""

from rest_framework import serializers

from company.models import OfficeLocation
from core.constants import Role

from .models import User
from .serializers import AvatarUrlMixin, LocationMiniSerializer, UserMiniSerializer


class EmployeeSerializer(AvatarUrlMixin, serializers.ModelSerializer):
    manager = UserMiniSerializer(read_only=True)
    office_location = LocationMiniSerializer(read_only=True)
    manager_id = serializers.PrimaryKeyRelatedField(
        source="manager",
        queryset=User.objects.none(),
        allow_null=True,
        required=False,
        write_only=True,
        error_messages={"does_not_exist": "Choose an active admin or manager as the reporting manager."},
    )
    office_location_id = serializers.PrimaryKeyRelatedField(
        source="office_location",
        queryset=OfficeLocation.objects.none(),
        allow_null=True,
        required=False,
        write_only=True,
        error_messages={"does_not_exist": "Choose one of your office locations."},
    )
    invite_pending = serializers.SerializerMethodField()
    direct_reports = serializers.IntegerField(read_only=True, default=0)
    send_invite = serializers.BooleanField(write_only=True, required=False, default=True)
    # Admin-chosen password (create only). When given, no invite email is sent.
    password = serializers.CharField(write_only=True, required=False, allow_blank=True, trim_whitespace=False, style={"input_type": "password"})
    must_change_password = serializers.BooleanField(write_only=True, required=False, default=True)
    # Create only: first password = their email address (always must be changed at first sign-in).
    use_email_as_password = serializers.BooleanField(write_only=True, required=False, default=False)
    # Read: the person still has an admin-set (e.g. email) password they haven't changed yet.
    password_change_pending = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = (
            "id",
            "employee_code",
            "name",
            "email",
            "phone",
            "designation",
            "role",
            "is_active",
            "joining_date",
            "date_of_birth",
            "internship_start",
            "internship_end",
            "internship",
            "remote_allowed",
            "avatar_url",
            "manager",
            "manager_id",
            "office_location",
            "office_location_id",
            "invite_pending",
            "direct_reports",
            "last_login",
            "created_at",
            "send_invite",
            "password",
            "must_change_password",
            "use_email_as_password",
            "password_change_pending",
        )
        read_only_fields = ("id", "is_active", "last_login", "created_at")
        extra_kwargs = {"email": {"validators": []}}  # uniqueness handled in validate_email (friendlier message)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        if request and request.user.is_authenticated:
            cid = request.user.company_id
            self.fields["manager_id"].queryset = User.objects.filter(
                company_id=cid, is_active=True, role__in=[Role.ADMIN, Role.MANAGER]
            )
            self.fields["office_location_id"].queryset = OfficeLocation.objects.filter(company_id=cid)

    def validate_date_of_birth(self, value):
        from .serializers import validate_birth_date

        return validate_birth_date(value)

    internship = serializers.SerializerMethodField()

    def get_internship(self, obj) -> dict | None:
        from .internship import internship_info

        return internship_info(obj)

    def validate_password(self, value):
        if not value:
            return ""
        from django.contrib.auth.password_validation import validate_password

        email = self.initial_data.get("email", "")
        name = self.initial_data.get("name", "")
        validate_password(value, User(email=email, name=name))
        return value

    def validate_employee_code(self, value):
        value = (value or "").strip().upper()
        if not value:
            return ""  # blank = assign automatically
        if not all(ch.isalnum() or ch in "-_/" for ch in value):
            raise serializers.ValidationError("Use letters, numbers, - _ or / only.")
        company_id = self.context["request"].user.company_id
        clash = User.objects.filter(company_id=company_id, employee_code__iexact=value)
        if self.instance:
            clash = clash.exclude(pk=self.instance.pk)
        if clash.exists():
            raise serializers.ValidationError(f"{value} is already used by {clash.first().name}.")
        return value

    def get_password_change_pending(self, obj) -> bool:
        return bool(obj.must_change_password and obj.has_usable_password())

    def get_invite_pending(self, obj) -> bool:
        return not obj.has_usable_password()

    def validate_email(self, value):
        value = value.strip().lower()
        qs = User.objects.filter(email__iexact=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("A user with this email already exists.")
        return value

    def validate_name(self, value):
        value = value.strip()
        if len(value) < 2:
            raise serializers.ValidationError("Name is too short.")
        return value

    def validate(self, attrs):
        request = self.context["request"]
        inst = self.instance
        manager = attrs.get("manager", inst.manager if inst else None)
        role = attrs.get("role", inst.role if inst else Role.EMPLOYEE)

        if inst and manager and manager.pk == inst.pk:
            raise serializers.ValidationError({"manager_id": "Someone can't report to themselves."})
        if inst and manager:
            # Walk up the chain to prevent cycles (A -> B -> A).
            seen, node = {inst.pk}, manager
            while node is not None:
                if node.pk in seen:
                    raise serializers.ValidationError(
                        {"manager_id": "This would create a reporting loop."}
                    )
                seen.add(node.pk)
                node = node.manager

        if inst and inst.pk == request.user.pk:
            if role != Role.ADMIN:
                raise serializers.ValidationError({"role": "You can't change your own role."})

        # Internship dates belong to interns only; the start defaults to the joining date.
        if role == Role.INTERN:
            start = attrs.get("internship_start", inst.internship_start if inst else None)
            end = attrs.get("internship_end", inst.internship_end if inst else None)
            joining = attrs.get("joining_date", inst.joining_date if inst else None)
            if not start:
                # New intern: their joining date. Existing staff becoming an intern: from today.
                from attendance.services import today_ist

                start = today_ist() if (inst and inst.role != Role.INTERN) else joining
            if start is None:
                raise serializers.ValidationError({"internship_start": "Set when the internship starts."})
            if end is not None and end < start:
                raise serializers.ValidationError({"internship_end": "The end date must be on or after the start date."})
            if end is not None and (end - start).days > 3 * 366:
                raise serializers.ValidationError({"internship_end": "An internship can be at most 3 years long."})
            attrs["internship_start"] = start
        else:
            attrs["internship_start"] = None
            attrs["internship_end"] = None

        if inst and inst.role == Role.MANAGER and role not in (Role.ADMIN, Role.MANAGER):
            reports = inst.reports.filter(is_active=True).count()
            if reports:
                raise serializers.ValidationError(
                    {"role": f"Reassign their {reports} direct report(s) before changing the role to {Role(role).label}."}
                )
        return attrs


class UserLookupSerializer(AvatarUrlMixin, serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ("id", "name", "email", "designation", "role", "avatar_url")


class SetPasswordSerializer(serializers.Serializer):
    password = serializers.CharField(trim_whitespace=False, required=False, allow_blank=True, style={"input_type": "password"})
    must_change_password = serializers.BooleanField(default=True)
    # Reset to their email address (forces a change at next sign-in).
    use_email = serializers.BooleanField(default=False)

    def validate(self, attrs):
        if attrs.get("use_email"):
            attrs["password"] = self.context["user"].email
            attrs["must_change_password"] = True
            return attrs
        pw = attrs.get("password") or ""
        if not pw:
            raise serializers.ValidationError({"password": "Enter a password, or reset it to their email address."})
        from django.contrib.auth.password_validation import validate_password

        validate_password(pw, self.context.get("user"))
        return attrs
