from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView
from rest_framework.routers import SimpleRouter

from accounts.employee_views import EmployeeViewSet, UserLookupView
from accounts.celebration_views import CelebrationsView, WishView
from accounts.profile_views import PersonActivityView, PersonOverviewView
from reports.views import DashboardView
from requests_app.views import RegularizationViewSet


def health(_request):
    return JsonResponse({"status": "ok"})


router = SimpleRouter()
router.register("employees", EmployeeViewSet, basename="employee")
router.register("regularizations", RegularizationViewSet, basename="regularization")

api_patterns = [
    path("health/", health, name="health"),
    path("auth/", include("accounts.urls")),
    path("company/", include("company.urls")),
    path("users/lookup/", UserLookupView.as_view(), name="user-lookup"),
    path("celebrations/", CelebrationsView.as_view(), name="celebrations"),
    path("celebrations/wishes/", WishView.as_view(), name="celebration-wish"),
    path("people/<int:pk>/overview/", PersonOverviewView.as_view(), name="person-overview"),
    path("people/<int:pk>/activity/", PersonActivityView.as_view(), name="person-activity"),
    path("attendance/", include("attendance.urls")),
    path("leave/", include("leaves.urls")),
    path("reports/", include("reports.urls")),
    path("dashboard/", DashboardView.as_view(), name="dashboard"),
    path("news/", include("news.urls")),
    path("notifications/", include("notifications.urls")),
    *router.urls,
    path("schema/", SpectacularAPIView.as_view(), name="schema"),
    path("docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="docs"),
]

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include(api_patterns)),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

admin.site.site_header = "HRMS Administration"
admin.site.site_title = "HRMS Admin"
