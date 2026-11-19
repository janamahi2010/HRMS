from django.urls import path

from . import views

urlpatterns = [
    path("today/", views.TodayView.as_view(), name="attendance-today"),
    path("check-in/", views.CheckInView.as_view(), name="attendance-check-in"),
    path("check-out/", views.CheckOutView.as_view(), name="attendance-check-out"),
    path("work-summary/", views.WorkSummaryView.as_view(), name="attendance-work-summary"),
    path("calendar/", views.CalendarView.as_view(), name="attendance-calendar"),
    path("team/", views.TeamDayView.as_view(), name="attendance-team"),
]
