from django.contrib import admin

from .models import RegularizationRequest


@admin.register(RegularizationRequest)
class RegularizationRequestAdmin(admin.ModelAdmin):
    list_display = ("user", "date", "type", "status", "approver", "decided_by", "created_at")
    list_filter = ("status", "type", "company")
    search_fields = ("user__name", "reason")
    date_hierarchy = "date"
    list_select_related = ("user", "approver", "decided_by")
    raw_id_fields = ("user", "approver", "decided_by")
