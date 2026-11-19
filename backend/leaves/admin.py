from django.contrib import admin

from .models import LeaveBalance, LeaveRequest, LeaveRequestCC, LeaveType


@admin.register(LeaveType)
class LeaveTypeAdmin(admin.ModelAdmin):
    list_display = ("name", "company", "yearly_quota", "allow_half_day", "is_paid", "color", "is_active")
    list_filter = ("is_active", "is_paid", "company")
    search_fields = ("name",)
    list_select_related = ("company",)


@admin.register(LeaveBalance)
class LeaveBalanceAdmin(admin.ModelAdmin):
    list_display = ("user", "leave_type", "year", "total", "used", "available")
    list_filter = ("year", "leave_type__name", "company")
    search_fields = ("user__name", "user__email")
    list_select_related = ("user", "leave_type")
    raw_id_fields = ("user",)


class LeaveRequestCCInline(admin.TabularInline):
    model = LeaveRequestCC
    extra = 0
    raw_id_fields = ("user",)


@admin.register(LeaveRequest)
class LeaveRequestAdmin(admin.ModelAdmin):
    list_display = ("user", "leave_type", "from_date", "to_date", "days", "status", "approver", "created_at")
    list_filter = ("status", "leave_type__name", "company")
    search_fields = ("user__name", "reason")
    date_hierarchy = "from_date"
    list_select_related = ("user", "leave_type", "approver")
    raw_id_fields = ("user", "approver", "decided_by")
    inlines = [LeaveRequestCCInline]


@admin.register(LeaveRequestCC)
class LeaveRequestCCAdmin(admin.ModelAdmin):
    list_display = ("request", "user", "created_at")
    list_select_related = ("request", "user")
    raw_id_fields = ("request", "user")
