from django.contrib.auth import authenticate
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

from company.models import Company

from .models import User


class CompanyMiniSerializer(serializers.ModelSerializer):
    logo_url = serializers.SerializerMethodField()

    class Meta:
        model = Company
        fields = ("id", "name", "logo_url")

    def get_logo_url(self, obj) -> str | None:
        if not obj.logo:
            return None
        url = obj.logo.url
        request = self.context.get("request")
        return request.build_absolute_uri(url) if request and url.startswith("/") else url


class UserMiniSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ("id", "name", "email", "designation")


class LocationMiniSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()


class MeSerializer(serializers.ModelSerializer):
    company = CompanyMiniSerializer(read_only=True)
    manager = UserMiniSerializer(read_only=True)
    office_location = LocationMiniSerializer(read_only=True)

    class Meta:
        model = User
        fields = (
            "id",
            "employee_code",
            "email",
            "name",
            "phone",
            "designation",
            "role",
            "joining_date",
            "date_of_birth",
            "show_birthday",
            "remote_allowed",
            "internship",
            "must_change_password",
            "company",
            "manager",
            "office_location",
        )
        read_only_fields = (
            "id", "employee_code", "email", "designation", "role", "joining_date", "company", "manager", "office_location",
            "must_change_password",
        )

    def validate_date_of_birth(self, value):
        return validate_birth_date(value)

    internship = serializers.SerializerMethodField()

    def get_internship(self, obj) -> dict | None:
        from .internship import internship_info

        return internship_info(obj)


def validate_birth_date(value):
    """Shared by Me and Employee serializers: a plausible adult birth date, never in the future."""
    from datetime import date

    if value is None:
        return value
    today = date.today()
    if value >= today:
        raise serializers.ValidationError("Date of birth must be in the past.")
    if value.year < today.year - 100 or value.year > today.year - 14:
        raise serializers.ValidationError("Enter a valid date of birth.")
    return value


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(trim_whitespace=False, write_only=True)

    def validate(self, attrs):
        email = attrs["email"].strip().lower()
        user = authenticate(self.context.get("request"), email=email, password=attrs["password"])
        if user is None:
            # Distinguish deactivated accounts only when the password is correct.
            candidate = User.objects.filter(email__iexact=email, is_active=False).first()
            if candidate and candidate.check_password(attrs["password"]):
                raise serializers.ValidationError(
                    "Your account has been deactivated. Please contact your admin.", code="inactive"
                )
            raise serializers.ValidationError("Invalid email or password.", code="invalid_credentials")
        if not user.company_id:
            raise serializers.ValidationError(
                "This account is not linked to a company.", code="no_company"
            )
        attrs["user"] = user
        return attrs


class SignupSerializer(serializers.Serializer):
    company_name = serializers.CharField(max_length=150)
    name = serializers.CharField(max_length=150)
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, trim_whitespace=False)

    def validate_email(self, value):
        value = value.strip().lower()
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("An account with this email already exists.")
        return value

    def validate(self, attrs):
        validate_password(attrs["password"], User(email=attrs["email"], name=attrs["name"]))
        return attrs


class ForgotPasswordSerializer(serializers.Serializer):
    email = serializers.EmailField()


class TokenSerializer(serializers.Serializer):
    uid = serializers.CharField()
    token = serializers.CharField()


class ResetPasswordSerializer(TokenSerializer):
    password = serializers.CharField(write_only=True, trim_whitespace=False)

    def validate_password(self, value):
        validate_password(value)
        return value


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True, trim_whitespace=False)
    new_password = serializers.CharField(write_only=True, trim_whitespace=False)

    def validate_current_password(self, value):
        if not self.context["request"].user.check_password(value):
            raise serializers.ValidationError("Current password is incorrect.")
        return value

    def validate_new_password(self, value):
        validate_password(value, self.context["request"].user)
        return value


class LogoutSerializer(serializers.Serializer):
    refresh = serializers.CharField()
