import django_filters as df
from django.db.models import OuterRef, Q, Subquery
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import filters, mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from attendance.models import Attendance
from core.approvals import decidable_q
from core.scoping import visible_user_q

from . import services
from .models import RegularizationRequest
from .serializers import DecisionSerializer, RegularizationCreateSerializer, RegularizationSerializer


class RegularizationFilter(df.FilterSet):
    date_from = df.DateFilter(field_name="date", lookup_expr="gte")
    date_to = df.DateFilter(field_name="date", lookup_expr="lte")

    class Meta:
        model = RegularizationRequest
        fields = ("status", "type", "user")


class RegularizationViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.CreateModelMixin, viewsets.GenericViewSet):
    """`?scope=mine` (default) | `approvals` (pending, decidable by me) | `team` (people I can see, excl. me)."""

    serializer_class = RegularizationSerializer
    filter_backends = [df.rest_framework.DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_class = RegularizationFilter
    search_fields = ("user__name", "user__email", "reason")
    ordering_fields = ("date", "created_at")
    ordering = ("-created_at",)

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return RegularizationRequest.objects.none()
        me = self.request.user
        qs = RegularizationRequest.objects.select_related("user", "approver", "decided_by").annotate(
            attendance_status=Subquery(
                Attendance.objects.filter(user_id=OuterRef("user_id"), date=OuterRef("date")).values("status")[:1]
            )
        )
        if self.action != "list":
            # Detail + actions: anything I can see or was asked to approve.
            return qs.filter(Q(company_id=me.company_id) & (visible_user_q(me) | Q(approver_id=me.id)))
        scope = self.request.query_params.get("scope", "mine")
        if scope == "approvals":
            return qs.filter(decidable_q(me)).order_by("date")
        if scope == "team" and me.role in ("admin", "manager"):
            return qs.filter(visible_user_q(me) | Q(approver_id=me.id, company_id=me.company_id)).exclude(user_id=me.id)
        return qs.filter(user_id=me.id)

    @extend_schema(parameters=[OpenApiParameter("scope", str, enum=["mine", "approvals", "team"])])
    def list(self, request, *args, **kwargs):
        return super().list(request, *args, **kwargs)

    @extend_schema(request=RegularizationCreateSerializer, responses=RegularizationSerializer)
    def create(self, request, *args, **kwargs):
        s = RegularizationCreateSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        obj = services.create_request(request.user, s.validated_data)
        return Response(self._out(obj.pk), status=status.HTTP_201_CREATED)

    def _out(self, pk):
        return self.get_serializer(self.get_queryset().get(pk=pk)).data

    def _decide(self, request, pk, approve):
        obj = self.get_object()  # 404 if out of scope
        s = DecisionSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        services.decide(request.user, obj.pk, approve, s.validated_data["comment"])
        return Response(self._out(obj.pk))

    @extend_schema(request=DecisionSerializer, responses=RegularizationSerializer)
    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        return self._decide(request, pk, True)

    @extend_schema(request=DecisionSerializer, responses=RegularizationSerializer)
    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        return self._decide(request, pk, False)

    @extend_schema(request=None, responses=RegularizationSerializer)
    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        obj = self.get_object()
        services.cancel(request.user, obj.pk)
        return Response(self._out(obj.pk))


