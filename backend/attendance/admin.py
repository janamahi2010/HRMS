from django.contrib import admin

from .models import Attendance


@admin.register(Attendance)
class AttendanceAdmin(admin.ModelAdmin):
    list_display = ("user", "date", "status", "check_in_at", "check_out_at", "worked_minutes", "source", "company")
    list_filter = ("status", "source", "company")
    search_fields = ("user__name", "user__email")
    date_hierarchy = "date"
    list_select_related = ("user", "company")
    raw_id_fields = ("user", "office_location")
