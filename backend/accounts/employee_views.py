from django.db.models import Count, Q
from django_filters import rest_framework as df
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import filters, mixins, viewsets
from rest_framework.decorators import action
from rest_framework.generics import ListAPIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from core.constants import Role
from core.permissions import IsAdmin

from . import services
from .employee_serializers import EmployeeSerializer, SetPasswordSerializer, UserLookupSerializer
from .models import User


class EmployeeFilter(df.FilterSet):
    status = df.ChoiceFilter(
        choices=(("active", "Active"), ("inactive", "Inactive")), method="filter_status"
    )

    class Meta:
        model = User
        fields = ("role", "manager", "office_location")

    def filter_status(self, qs, _name, value):
        return qs.filter(is_active=(value == "active"))


class EmployeeViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    """Admin-only employee directory. No hard delete: deactivate instead (keeps history)."""

    serializer_class = EmployeeSerializer
    permission_classes = [IsAdmin]
    filter_backends = [df.DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_class = EmployeeFilter
    search_fields = ("name", "email", "designation", "phone", "employee_code")
    ordering_fields = ("name", "joining_date", "created_at", "role")
    ordering = ("name",)
    http_method_names = ["get", "post", "patch"]

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):  # schema generation
            return User.objects.none()
        return (
            User.objects.filter(company_id=self.request.user.company_id)
            .select_related("manager", "office_location")
            .annotate(direct_reports=Count("reports", filter=Q(reports__is_active=True)))
        )

    def perform_create(self, serializer):
        data = dict(serializer.validated_data)
        send = data.pop("send_invite", True)
        password = data.pop("password", "") or None
        must_change = data.pop("must_change_password", True)
        if data.pop("use_email_as_password", False):
            # Default first password is their (lower-cased) sign-in email; it must be changed on first sign-in.
            password, must_change = data["email"].strip().lower(), True
        serializer.instance = services.create_employee(
            actor=self.request.user, data=data, send_invite_email=send, password=password, must_change_password=must_change
        )

    def perform_update(self, serializer):
        data = dict(serializer.validated_data)
        data.pop("send_invite", None)
        data.pop("password", None)  # use the set-password action for existing people
        data.pop("must_change_password", None)
        data.pop("use_email_as_password", None)
        if "employee_code" in data and not data["employee_code"]:
            data.pop("employee_code")  # blank on edit = keep the current ID
        serializer.instance = services.update_employee(actor=self.request.user, user=serializer.instance, data=data)

    def _respond(self, user):
        return Response(self.get_serializer(self.get_queryset().get(pk=user.pk)).data)

    @extend_schema(request=None, responses=EmployeeSerializer)
    @action(detail=True, methods=["post"])
    def deactivate(self, request, pk=None):
        return self._respond(services.set_active(actor=request.user, user=self.get_object(), active=False))

    @extend_schema(request=None, responses=EmployeeSerializer)
    @action(detail=True, methods=["post"])
    def activate(self, request, pk=None):
        return self._respond(services.set_active(actor=request.user, user=self.get_object(), active=True))

    @extend_schema(request=SetPasswordSerializer, responses=EmployeeSerializer)
    @action(detail=True, methods=["post"], url_path="set-password")
    def set_password(self, request, pk=None):
        s = SetPasswordSerializer(data=request.data, context={"user": self.get_object()})
        s.is_valid(raise_exception=True)
        user = services.admin_set_password(
            actor=request.user, user=self.get_object(), password=s.validated_data["password"], must_change=s.validated_data["must_change_password"]
        )
        return self._respond(user)

    @extend_schema(request=None, responses={200: None})
    @action(detail=True, methods=["post"], url_path="resend-invite")
    def resend_invite(self, request, pk=None):
        user = self.get_object()
        if not user.is_active:
            from core.exceptions import ServiceError

            raise ServiceError("Activate this user before sending an invite.", code="inactive_user")
        services.send_invite(user, invited_by=request.user)
        return Response({"detail": f"Invite sent to {user.email}."})


@extend_schema(
    parameters=[
        OpenApiParameter("search", str),
        OpenApiParameter("roles", str, description="Comma-separated roles, e.g. admin,manager"),
        OpenApiParameter("ids", str, description="Comma-separated ids (to hydrate selected values)"),
    ]
)
class UserLookupView(ListAPIView):
    """Lightweight active-colleague search for pickers (CC, manager). Company-scoped, max 20."""

    serializer_class = UserLookupSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None
    filter_backends = [filters.SearchFilter]
    search_fields = ("name", "email", "designation")

    def get_queryset(self):
        qs = User.objects.filter(company_id=self.request.user.company_id, is_active=True).only(
            "id", "name", "email", "designation", "role"
        )
        roles = [r for r in self.request.query_params.get("roles", "").split(",") if r in Role.values]
        if roles:
            qs = qs.filter(role__in=roles)
        ids = [int(i) for i in self.request.query_params.get("ids", "").split(",") if i.isdigit()]
        if ids:
            qs = qs.filter(pk__in=ids)
        return qs.order_by("name")

    def list(self, request, *args, **kwargs):
        qs = self.filter_queryset(self.get_queryset())[:20]
        return Response(self.get_serializer(qs, many=True).data)
