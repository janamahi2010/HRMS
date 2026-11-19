from datetime import date, timedelta

import django_filters as df
from django.db.models import Prefetch, Q
from django.http import Http404
from django.shortcuts import get_object_or_404
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import filters, mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User
from accounts.serializers import UserMiniSerializer
from attendance.services import today_ist
from company.models import Holiday
from company.services import get_settings
from core.approvals import decidable_q
from core.exceptions import ServiceError
from core.models import AuditLog
from core.pagination import StandardPagination
from core.permissions import IsAdmin, IsAdminOrReadOnly
from core.scoping import CompanyScopedMixin, visible_user_q, visible_users

from . import services
from .models import LeaveBalance, LeaveRequest, LeaveType
from .serializers import (
    BalanceAdjustSerializer,
    LeaveApplySerializer,
    LeaveBalanceSerializer,
    LeavePreviewSerializer,
    LeaveRequestSerializer,
    LeaveTypeSerializer,
)


class LeaveTypeViewSet(CompanyScopedMixin, viewsets.ModelViewSet):
    serializer_class = LeaveTypeSerializer
    permission_classes = [IsAdminOrReadOnly]
    pagination_class = None
    queryset = LeaveType.objects.all()

    def get_queryset(self):
        qs = super().get_queryset().filter(for_interns=False)  # the intern "Leave" type is system-managed
        if self.request.user.role != "admin":
            qs = qs.filter(is_active=True)
        return qs

    def perform_create(self, serializer):
        lt = serializer.save(company=self.request.user.company)
        self._credit(lt)

    def perform_update(self, serializer):
        old = serializer.instance.accrual
        lt = serializer.save()
        if lt.accrual != old:
            services.switch_accrual(lt, old)
        if lt.is_active:
            self._credit(lt)

    def _credit(self, lt):
        # Give everyone this year's (pro-rata) balance for a new / re-activated type. Idempotent.
        year = today_ist().year
        for u in User.objects.filter(company_id=lt.company_id, is_active=True):
            services.credit_balances_for_user(u, year)

    def perform_destroy(self, instance):
        if instance.requests.exists():
            raise ServiceError(
                f"{instance.name} has leave requests, so it can't be deleted. Deactivate it instead.",
                code="in_use",
                status_code=409,
            )
        instance.delete()


def _year(request) -> int:
    try:
        return int(request.query_params.get("year") or today_ist().year)
    except ValueError:
        return today_ist().year


class BalancesView(APIView):
    @extend_schema(parameters=[OpenApiParameter("user", int), OpenApiParameter("year", int)], responses=LeaveBalanceSerializer(many=True))
    def get(self, request):
        uid = request.query_params.get("user")
        target = get_object_or_404(visible_users(request.user), pk=uid) if uid else request.user
        year = _year(request)
        if year == today_ist().year:
            services.credit_balances_for_user(target, year)  # self-heal: types added mid-year
        qs = services.visible_balances(target, year)
        return Response(LeaveBalanceSerializer(qs, many=True).data)


class BalanceOverviewView(APIView):
    """Admin grid: every active employee with this year's balances."""

    permission_classes = [IsAdmin]

    @extend_schema(parameters=[OpenApiParameter("year", int), OpenApiParameter("search", str), OpenApiParameter("page", int)], responses=OpenApiTypes.OBJECT)
    def get(self, request):
        year = _year(request)
        if year == today_ist().year:
            services.top_up_monthly(company_id=request.user.company_id, year=year)
        users = User.objects.filter(company_id=request.user.company_id, is_active=True).order_by("name")
        if s := (request.query_params.get("search") or "").strip():
            users = users.filter(Q(name__icontains=s) | Q(email__icontains=s))
        users = users.prefetch_related(
            Prefetch(
                "leave_balances",
                queryset=LeaveBalance.objects.filter(year=year, leave_type__is_active=True).select_related("leave_type"),
                to_attr="year_balances",
            )
        )
        paginator = StandardPagination()
        page = paginator.paginate_queryset(users, request, view=self)
        types = LeaveType.objects.filter(company_id=request.user.company_id, is_active=True)
        rows = [
            {
                "user": UserMiniSerializer(u).data,
                "balances": {
                    b.leave_type_id: {"total": float(b.total), "used": float(b.used), "available": float(b.available)}
                    for b in u.year_balances
                },
            }
            for u in page
        ]
        resp = paginator.get_paginated_response(rows)
        resp.data["types"] = LeaveTypeSerializer(types, many=True, context={"request": request}).data
        resp.data["year"] = year
        return resp


class AdjustBalanceView(APIView):
    permission_classes = [IsAdmin]

    @extend_schema(request=BalanceAdjustSerializer, responses=LeaveBalanceSerializer)
    def post(self, request):
        s = BalanceAdjustSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        v = s.validated_data
        target = get_object_or_404(User, pk=v["user"], company_id=request.user.company_id)
        lt = get_object_or_404(LeaveType, pk=v["leave_type"], company_id=request.user.company_id)
        bal = services.adjust_balance(request.user, target, lt, v["year"], v["delta"], v["reason"].strip())
        return Response(LeaveBalanceSerializer(LeaveBalance.objects.select_related("leave_type").get(pk=bal.pk)).data)


class AdjustmentHistoryView(APIView):
    permission_classes = [IsAdmin]

    @extend_schema(parameters=[OpenApiParameter("user", int)], responses=OpenApiTypes.OBJECT)
    def get(self, request):
        logs = AuditLog.objects.filter(
            company_id=request.user.company_id, action=AuditLog.Action.LEAVE_BALANCE_ADJUSTED
        ).select_related("actor", "target_user")
        if uid := request.query_params.get("user"):
            logs = logs.filter(target_user_id=uid)
        return Response(
            [
                {
                    "id": log.id,
                    "message": log.message,
                    "data": log.data,
                    "actor": log.actor.name if log.actor else None,
                    "target": log.target_user.name if log.target_user else None,
                    "created_at": log.created_at,
                }
                for log in logs.order_by("-created_at")[:50]
            ]
        )


class LeaveRequestFilter(df.FilterSet):
    date_from = df.DateFilter(field_name="to_date", lookup_expr="gte")
    date_to = df.DateFilter(field_name="from_date", lookup_expr="lte")

    class Meta:
        model = LeaveRequest
        fields = ("status", "leave_type", "user")


class LeaveRequestViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.CreateModelMixin, viewsets.GenericViewSet):
    """`?scope=mine` (default) | `approvals` | `team` | `cc` (requests I'm CC'd on, view-only)."""

    serializer_class = LeaveRequestSerializer
    filter_backends = [df.rest_framework.DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_class = LeaveRequestFilter
    search_fields = ("user__name", "user__email", "reason")
    ordering_fields = ("from_date", "created_at")
    ordering = ("-created_at",)

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return LeaveRequest.objects.none()
        me = self.request.user
        qs = LeaveRequest.objects.select_related("user", "approver", "decided_by", "leave_type").prefetch_related("cc_users")
        if self.action != "list":
            return qs.filter(
                Q(company_id=me.company_id) & (visible_user_q(me) | Q(approver_id=me.id) | Q(cc_entries__user_id=me.id))
            ).distinct()
        scope = self.request.query_params.get("scope", "mine")
        if scope == "approvals":
            return qs.filter(decidable_q(me)).order_by("from_date")
        if scope == "cc":
            return qs.filter(company_id=me.company_id, cc_entries__user_id=me.id)
        if scope == "team" and me.role in ("admin", "manager"):
            return qs.filter(visible_user_q(me) | Q(approver_id=me.id, company_id=me.company_id)).exclude(user_id=me.id)
        return qs.filter(user_id=me.id)

    @extend_schema(parameters=[OpenApiParameter("scope", str, enum=["mine", "approvals", "team", "cc"])])
    def list(self, request, *args, **kwargs):
        return super().list(request, *args, **kwargs)

    def _out(self, pk):
        return self.get_serializer(self.get_queryset().get(pk=pk)).data

    @extend_schema(request=LeaveApplySerializer, responses=LeaveRequestSerializer)
    def create(self, request, *args, **kwargs):
        s = LeaveApplySerializer(data=request.data)
        s.is_valid(raise_exception=True)
        req = services.apply_leave(request.user, s.to_service())
        return Response(self._out(req.pk), status=status.HTTP_201_CREATED)

    def _decide(self, request, approve):
        obj = self.get_object()
        comment = str(request.data.get("comment", ""))[:500]
        services.decide_leave(request.user, obj.pk, approve, comment)
        return Response(self._out(obj.pk))

    @extend_schema(request=OpenApiTypes.OBJECT, responses=LeaveRequestSerializer)
    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        return self._decide(request, True)

    @extend_schema(request=OpenApiTypes.OBJECT, responses=LeaveRequestSerializer)
    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        return self._decide(request, False)

    @extend_schema(request=None, responses=LeaveRequestSerializer)
    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        obj = self.get_object()
        services.cancel_leave(request.user, obj.pk)
        return Response(self._out(obj.pk))


class PreviewView(APIView):
    @extend_schema(request=LeavePreviewSerializer, responses=OpenApiTypes.OBJECT, summary="Live day count, balance and issues")
    def post(self, request):
        s = LeavePreviewSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        v = s.validated_data
        lt = services.leave_type_for(request.user, v.get("leave_type"))
        if lt is None:
            raise Http404
        return Response(services.assess(request.user, lt, v["from_date"], v["to_date"], v["is_half_day"], v["half"]))


class OnLeaveView(APIView):
    @extend_schema(parameters=[OpenApiParameter("date", str)], responses=OpenApiTypes.OBJECT, summary="Who's on leave on a date")
    def get(self, request):
        try:
            d = date.fromisoformat(request.query_params["date"]) if request.query_params.get("date") else today_ist()
        except ValueError:
            d = today_ist()
        rows = services.on_leave_on(request.user.company_id, d)
        return Response(
            {
                "date": d,
                "results": [
                    {
                        "user": UserMiniSerializer(r.user).data,
                        "leave_type": {"name": r.leave_type.name, "color": r.leave_type.color},
                        "from_date": r.from_date,
                        "to_date": r.to_date,
                        "is_half_day": r.is_half_day,
                        "half": r.half or None,
                    }
                    for r in rows
                ],
            }
        )


class TeamCalendarView(APIView):
    @extend_schema(parameters=[OpenApiParameter("year", int), OpenApiParameter("month", int)], responses=OpenApiTypes.OBJECT)
    def get(self, request):
        today = today_ist()
        try:
            year = int(request.query_params.get("year") or today.year)
            month = int(request.query_params.get("month") or today.month)
            start = date(year, month, 1)
        except ValueError:
            start = today.replace(day=1)
        end = date(start.year + (start.month == 12), start.month % 12 + 1, 1) - timedelta(days=1)
        ids = services.team_member_ids(request.user)
        members = User.objects.filter(id__in=ids).order_by("name")
        leaves = (
            LeaveRequest.objects.filter(
                user_id__in=ids, status__in=["approved", "pending"], from_date__lte=end, to_date__gte=start
            )
            .select_related("leave_type")
            .order_by("from_date")
        )
        cfg = get_settings(request.user.company_id)
        return Response(
            {
                "year": start.year,
                "month": start.month,
                "weekly_offs": cfg.weekly_offs,
                "holidays": [
                    {"date": h.date, "name": h.name}
                    for h in Holiday.objects.filter(company_id=request.user.company_id, date__range=(start, end))
                ],
                "members": UserMiniSerializer(members, many=True).data,
                "leaves": [
                    {
                        "id": lr.id,
                        "user_id": lr.user_id,
                        "from_date": lr.from_date,
                        "to_date": lr.to_date,
                        "status": lr.status,
                        "is_half_day": lr.is_half_day,
                        "half": lr.half or None,
                        "days": float(lr.days),
                        "leave_type": {"name": lr.leave_type.name, "color": lr.leave_type.color},
                    }
                    for lr in leaves
                ],
            }
        )
