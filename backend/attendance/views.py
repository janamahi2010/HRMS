from django.db.models import Q
from django.shortcuts import get_object_or_404
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.response import Response
from rest_framework.views import APIView

from core.permissions import IsManagerOrAdmin
from core.scoping import visible_users
from core.throttles import CheckInThrottle

from . import services
from .serializers import CalendarQuerySerializer, PunchSerializer, TeamQuerySerializer, WorkSummarySerializer


def _fix(request) -> services.Fix:
    s = PunchSerializer(data=request.data)
    s.is_valid(raise_exception=True)
    return services.Fix(
        lat=s.validated_data.get("lat"),
        lng=s.validated_data.get("lng"),
        accuracy=s.validated_data.get("accuracy") or 0.0,
        ip=services.client_ip(request),
        user_agent=request.META.get("HTTP_USER_AGENT", ""),
    )


def _me(request):
    # Fresh copy with the office joined (request.user may be cached by the auth backend).
    from accounts.models import User

    return User.objects.select_related("office_location").get(pk=request.user.pk)


class TodayView(APIView):
    @extend_schema(summary="Today's attendance state for the check-in card", responses=OpenApiTypes.OBJECT)
    def get(self, request):
        return Response(services.today_state(_me(request)))


class CheckInView(APIView):
    throttle_classes = [CheckInThrottle]

    @extend_schema(summary="Check in (server time, GPS radius check)", request=PunchSerializer, responses=OpenApiTypes.OBJECT)
    def post(self, request):
        services.check_in(request.user, _fix(request))
        return Response(services.today_state(_me(request)), status=201)


class CheckOutView(APIView):
    throttle_classes = [CheckInThrottle]

    @extend_schema(summary="Check out (server time, GPS radius check)", request=PunchSerializer, responses=OpenApiTypes.OBJECT)
    def post(self, request):
        services.check_out(request.user, _fix(request))
        return Response(services.today_state(_me(request)))


class WorkSummaryView(APIView):
    """The signed-in user's own daily work note (what they worked on). Managers/admins read it via calendar/team/reports."""

    @extend_schema(summary="Save my work summary for a day", request=WorkSummarySerializer, responses=OpenApiTypes.OBJECT)
    def put(self, request):
        s = WorkSummarySerializer(data=request.data)
        s.is_valid(raise_exception=True)
        d = s.validated_data.get("date") or services.today_ist()
        row = services.save_work_summary(request.user, d, s.validated_data["summary"])
        return Response(services.serialize_record(row))


class CalendarView(APIView):
    @extend_schema(
        responses=OpenApiTypes.OBJECT,
        summary="Month calendar for me (or a visible user)",
        parameters=[
            OpenApiParameter("year", int),
            OpenApiParameter("month", int),
            OpenApiParameter("user", int, description="Admins: anyone; managers: direct reports."),
        ],
    )
    def get(self, request):
        q = CalendarQuerySerializer(data=request.query_params)
        q.is_valid(raise_exception=True)
        today = services.today_ist()
        year = q.validated_data.get("year", today.year)
        month = q.validated_data.get("month", today.month)
        uid = q.validated_data.get("user")
        target = (
            get_object_or_404(visible_users(request.user), pk=uid) if uid and uid != request.user.id else request.user
        )
        return Response(services.month_calendar(target, year, month))


class TeamDayView(APIView):
    permission_classes = [IsManagerOrAdmin]

    @extend_schema(
        responses=OpenApiTypes.OBJECT,
        summary="Everyone's attendance on a date (admins: company; managers: team)",
        parameters=[OpenApiParameter("date", str), OpenApiParameter("search", str), OpenApiParameter("office_location", int)],
    )
    def get(self, request):
        q = TeamQuerySerializer(data=request.query_params)
        q.is_valid(raise_exception=True)
        d = q.validated_data.get("date") or services.today_ist()
        users = visible_users(request.user).filter(is_active=True).select_related("office_location").order_by("name")
        if s := (q.validated_data.get("search") or "").strip():
            users = users.filter(Q(name__icontains=s) | Q(email__icontains=s) | Q(designation__icontains=s))
        if loc := q.validated_data.get("office_location"):
            users = users.filter(office_location_id=loc)
        rows = services.team_day(request.user, d, users)
        summary: dict[str, int] = {}
        for r in rows:
            key = r["status"] or "none"
            summary[key] = summary.get(key, 0) + 1
        return Response({"date": d, "total": len(rows), "summary": summary, "results": rows})
