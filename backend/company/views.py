from django.db.models import Count, Q
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import status, viewsets
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from core.models import AuditLog, audit
from core.permissions import IsAdmin, IsAdminOrReadOnly
from core.scoping import CompanyScopedMixin

from .models import Holiday, OfficeLocation
from .serializers import (
    CompanySerializer,
    CompanySettingsSerializer,
    HolidaySerializer,
    LogoUploadSerializer,
    PosterUploadSerializer,
    OfficeLocationSerializer,
)
from .services import get_settings


class CompanyView(APIView):
    """The caller's own company. Everyone can read; admins can rename."""

    permission_classes = [IsAdminOrReadOnly]

    @extend_schema(responses=CompanySerializer)
    def get(self, request):
        return Response(CompanySerializer(request.user.company, context={"request": request}).data)

    @extend_schema(request=CompanySerializer, responses=CompanySerializer)
    def patch(self, request):
        s = CompanySerializer(request.user.company, data=request.data, partial=True, context={"request": request})
        s.is_valid(raise_exception=True)
        s.save()
        return Response(s.data)


class CompanyLogoView(APIView):
    permission_classes = [IsAdmin]
    parser_classes = [MultiPartParser, FormParser]

    @extend_schema(request={"multipart/form-data": LogoUploadSerializer}, responses=CompanySerializer)
    def post(self, request):
        s = LogoUploadSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        company = request.user.company
        old = company.logo.name if company.logo else None
        company.logo = s.validated_data["logo"]
        company.save(update_fields=["logo", "updated_at"])
        if old:
            company.logo.storage.delete(old)
        return Response(CompanySerializer(company, context={"request": request}).data)

    @extend_schema(responses={204: None})
    def delete(self, request):
        company = request.user.company
        if company.logo:
            company.logo.delete(save=False)
            company.logo = None
            company.save(update_fields=["logo", "updated_at"])
        return Response(status=status.HTTP_204_NO_CONTENT)


class BirthdayPosterView(APIView):
    """Admin-uploaded artwork for birthday cards; DELETE goes back to the built-in design."""

    permission_classes = [IsAdmin]
    parser_classes = [MultiPartParser, FormParser]

    @extend_schema(request={"multipart/form-data": PosterUploadSerializer}, responses=CompanySerializer)
    def post(self, request):
        s = PosterUploadSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        company = request.user.company
        old = company.birthday_poster.name if company.birthday_poster else None
        company.birthday_poster = s.validated_data["poster"]
        company.save(update_fields=["birthday_poster", "updated_at"])
        if old:
            company.birthday_poster.storage.delete(old)
        return Response(CompanySerializer(company, context={"request": request}).data)

    @extend_schema(responses={204: None})
    def delete(self, request):
        company = request.user.company
        if company.birthday_poster:
            company.birthday_poster.delete(save=False)
            company.birthday_poster = None
            company.save(update_fields=["birthday_poster", "updated_at"])
        return Response(status=status.HTTP_204_NO_CONTENT)


class CompanySettingsView(APIView):
    """Attendance rules. Everyone can read (the UI needs office hours); admins can edit."""

    permission_classes = [IsAdminOrReadOnly]

    def _obj(self, request):
        obj = get_settings(request.user.company_id)
        return type(obj).objects.prefetch_related("default_cc").get(pk=obj.pk)

    @extend_schema(responses=CompanySettingsSerializer)
    def get(self, request):
        return Response(CompanySettingsSerializer(self._obj(request), context={"request": request}).data)

    @extend_schema(request=CompanySettingsSerializer, responses=CompanySettingsSerializer)
    def patch(self, request):
        obj = self._obj(request)
        s = CompanySettingsSerializer(obj, data=request.data, partial=True, context={"request": request})
        s.is_valid(raise_exception=True)
        s.save()
        audit(
            company=request.user.company,
            actor=request.user,
            action=AuditLog.Action.SETTINGS_UPDATED,
            message="Updated attendance settings",
            data={k: str(v) for k, v in request.data.items()},
        )
        return Response(CompanySettingsSerializer(self._obj(request), context={"request": request}).data)


class OfficeLocationViewSet(CompanyScopedMixin, viewsets.ModelViewSet):
    serializer_class = OfficeLocationSerializer
    permission_classes = [IsAdminOrReadOnly]
    pagination_class = None  # a company has a handful of offices
    filter_backends = []

    def get_queryset(self):
        return (
            super()
            .get_queryset()
            .annotate(employee_count=Count("users", filter=Q(users__is_active=True)))
            .order_by("name")
        )

    queryset = OfficeLocation.objects.all()


@extend_schema(parameters=[OpenApiParameter("year", int, description="Filter by calendar year")])
class HolidayViewSet(CompanyScopedMixin, viewsets.ModelViewSet):
    serializer_class = HolidaySerializer
    permission_classes = [IsAdminOrReadOnly]
    pagination_class = None
    filter_backends = []
    queryset = Holiday.objects.all()

    def get_queryset(self):
        qs = super().get_queryset().order_by("date")
        year = self.request.query_params.get("year")
        if year and year.isdigit():
            qs = qs.filter(date__year=int(year))
        return qs
