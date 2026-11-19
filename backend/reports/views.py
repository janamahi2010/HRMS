from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from core.permissions import IsManagerOrAdmin

from . import services


class RangeQuery(serializers.Serializer):
    to = serializers.DateField(required=False)
    user = serializers.IntegerField(required=False)
    office_location = serializers.IntegerField(required=False)

    def get_fields(self):
        fields = super().get_fields()
        fields["from"] = serializers.DateField(required=False)  # `from` is a Python keyword
        return fields


RANGE_PARAMS = [
    OpenApiParameter("from", str, description="YYYY-MM-DD (default: 1st of this month)"),
    OpenApiParameter("to", str, description="YYYY-MM-DD (default: today)"),
    OpenApiParameter("user", int),
    OpenApiParameter("office_location", int),
]


def _range_args(request) -> dict:
    q = RangeQuery(data=request.query_params)
    q.is_valid(raise_exception=True)
    v = q.validated_data
    return {"start": v.get("from"), "end": v.get("to"), "user_id": v.get("user"), "office_id": v.get("office_location")}


class DashboardView(APIView):
    @extend_schema(summary="Everything the home dashboard needs, in one call (role-aware)", responses=OpenApiTypes.OBJECT)
    def get(self, request):
        from accounts.models import User

        me = User.objects.select_related("office_location").get(pk=request.user.pk)
        return Response(services.dashboard(me))


class AttendanceSummaryReport(APIView):
    permission_classes = [IsManagerOrAdmin]

    @extend_schema(summary="Per-person attendance summary for a date range", parameters=RANGE_PARAMS, responses=OpenApiTypes.OBJECT)
    def get(self, request):
        return Response(services.attendance_summary(request.user, **_range_args(request)))


class AttendanceDailyReport(APIView):
    permission_classes = [IsManagerOrAdmin]

    @extend_schema(summary="Day-by-day attendance log for a date range", parameters=RANGE_PARAMS, responses=OpenApiTypes.OBJECT)
    def get(self, request):
        return Response(services.attendance_daily(request.user, **_range_args(request)))


class LeaveReport(APIView):
    permission_classes = [IsManagerOrAdmin]

    @extend_schema(
        summary="Leave balances and requests for a year",
        parameters=[OpenApiParameter("year", int), OpenApiParameter("user", int)],
        responses=OpenApiTypes.OBJECT,
    )
    def get(self, request):
        try:
            year = int(request.query_params.get("year") or 0) or None
        except ValueError:
            year = None
        uid = request.query_params.get("user")
        return Response(services.leave_report(request.user, year, int(uid) if uid and uid.isdigit() else None))
