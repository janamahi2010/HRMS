from django.urls import path
from rest_framework.routers import SimpleRouter

from . import views

router = SimpleRouter()
router.register("types", views.LeaveTypeViewSet, basename="leave-type")
router.register("requests", views.LeaveRequestViewSet, basename="leave-request")

urlpatterns = [
    path("balances/", views.BalancesView.as_view(), name="leave-balances"),
    path("balances/overview/", views.BalanceOverviewView.as_view(), name="leave-balance-overview"),
    path("balances/adjust/", views.AdjustBalanceView.as_view(), name="leave-balance-adjust"),
    path("balances/adjustments/", views.AdjustmentHistoryView.as_view(), name="leave-balance-adjustments"),
    path("preview/", views.PreviewView.as_view(), name="leave-preview"),
    path("on-leave/", views.OnLeaveView.as_view(), name="leave-on-leave"),
    path("calendar/", views.TeamCalendarView.as_view(), name="leave-calendar"),
    *router.urls,
]
