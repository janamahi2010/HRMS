from django.urls import path

from . import views

urlpatterns = [
    path("attendance/summary/", views.AttendanceSummaryReport.as_view(), name="report-attendance-summary"),
    path("attendance/daily/", views.AttendanceDailyReport.as_view(), name="report-attendance-daily"),
    path("leave/", views.LeaveReport.as_view(), name="report-leave"),
]
