from django.contrib.auth.models import update_last_login
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers, status
from rest_framework.generics import RetrieveUpdateAPIView
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core.throttles import LoginThrottle, PasswordResetThrottle, PasswordTokenThrottle, SignupThrottle

from . import services
from .serializers import (
    ChangePasswordSerializer,
    ForgotPasswordSerializer,
    LoginSerializer,
    LogoutSerializer,
    MeSerializer,
    ResetPasswordSerializer,
    SignupSerializer,
    TokenSerializer,
)

AuthResponse = inline_serializer(
    "AuthResponse",
    {"access": serializers.CharField(), "refresh": serializers.CharField(), "user": MeSerializer()},
)
DetailResponse = inline_serializer("DetailResponse", {"detail": serializers.CharField()})


def _auth_payload(user, request):
    return {**services.issue_tokens(user), "user": MeSerializer(user, context={"request": request}).data}


class LoginView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [LoginThrottle]

    @extend_schema(request=LoginSerializer, responses=AuthResponse)
    def post(self, request):
        s = LoginSerializer(data=request.data, context={"request": request})
        s.is_valid(raise_exception=True)
        user = s.validated_data["user"]
        update_last_login(None, user)
        return Response(_auth_payload(user, request))


class SignupView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [SignupThrottle]

    @extend_schema(request=SignupSerializer, responses={201: AuthResponse})
    def post(self, request):
        s = SignupSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        user = services.signup_company(**s.validated_data)
        return Response(_auth_payload(user, request), status=status.HTTP_201_CREATED)


class LogoutView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    @extend_schema(request=LogoutSerializer, responses={204: None})
    def post(self, request):
        s = LogoutSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        from .tokens import revoke_session

        revoke_session(s.validated_data["refresh"])  # idempotent
        return Response(status=status.HTTP_204_NO_CONTENT)


class ForgotPasswordView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [PasswordResetThrottle]

    @extend_schema(request=ForgotPasswordSerializer, responses=DetailResponse)
    def post(self, request):
        s = ForgotPasswordSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        services.request_password_reset(s.validated_data["email"])
        return Response(
            {"detail": "If an account exists for this email, a reset link has been sent."}
        )


class ValidateResetTokenView(APIView):
    """Lets the set/reset password page show 'link expired' before the user types anything."""

    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [PasswordTokenThrottle]

    @extend_schema(
        request=TokenSerializer,
        responses=inline_serializer(
            "TokenValidResponse", {"email": serializers.EmailField(), "name": serializers.CharField()}
        ),
    )
    def post(self, request):
        s = TokenSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        user = services.get_user_from_token(**s.validated_data)
        return Response({"email": user.email, "name": user.name})


class ResetPasswordView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [PasswordTokenThrottle]

    @extend_schema(request=ResetPasswordSerializer, responses=AuthResponse)
    def post(self, request):
        s = ResetPasswordSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        user = services.reset_password(**s.validated_data)
        # Log the user straight in after setting a password: smoother invite flow.
        update_last_login(None, user)
        return Response(_auth_payload(user, request))


class ChangePasswordView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=ChangePasswordSerializer, responses=AuthResponse)
    def post(self, request):
        s = ChangePasswordSerializer(data=request.data, context={"request": request})
        s.is_valid(raise_exception=True)
        user = request.user
        user.set_password(s.validated_data["new_password"])
        user.must_change_password = False
        user.save(update_fields=["password", "must_change_password", "updated_at"])
        services.revoke_all_tokens(user)
        return Response(_auth_payload(user, request))


class MeView(RetrieveUpdateAPIView):
    serializer_class = MeSerializer
    permission_classes = [IsAuthenticated]
    http_method_names = ["get", "patch"]

    def get_object(self):
        u = self.request.user
        # Re-fetch with relations to avoid lazy queries during serialization.
        return type(u).objects.select_related("company", "manager", "office_location").get(pk=u.pk)

    # Self-service changes that matter to HR are recorded on the person's activity timeline.
    AUDITED = ("name", "phone", "date_of_birth", "show_birthday")

    def perform_update(self, serializer):
        from core.models import AuditLog, audit

        before = {f: getattr(serializer.instance, f) for f in self.AUDITED}
        user = serializer.save()
        changed = [f for f in self.AUDITED if before[f] != getattr(user, f)]
        if changed:
            labels = {"date_of_birth": "date of birth", "show_birthday": "birthday visibility"}
            audit(
                company=user.company,
                actor=user,
                target_user=user,
                action=AuditLog.Action.USER_UPDATED,
                message=f"{user.name} updated their {', '.join(labels.get(f, f) for f in changed)}",
                data={"fields": changed},  # field names only: the date itself isn't copied into the log
            )
