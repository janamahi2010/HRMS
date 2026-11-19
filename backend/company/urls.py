from django.urls import path
from rest_framework.routers import SimpleRouter

from . import views

router = SimpleRouter()
router.register("locations", views.OfficeLocationViewSet, basename="location")
router.register("holidays", views.HolidayViewSet, basename="holiday")

urlpatterns = [
    path("", views.CompanyView.as_view(), name="company"),
    path("birthday-poster/", views.BirthdayPosterView.as_view(), name="company-birthday-poster"),
    path("logo/", views.CompanyLogoView.as_view(), name="company-logo"),
    path("settings/", views.CompanySettingsView.as_view(), name="company-settings"),
    *router.urls,
]
