from django.contrib import admin

from .models import Company, CompanySettings, Holiday, OfficeLocation


class CompanySettingsInline(admin.StackedInline):
    model = CompanySettings
    can_delete = False
    filter_horizontal = ("default_cc",)


@admin.register(Company)
class CompanyAdmin(admin.ModelAdmin):
    list_display = ("name", "created_at")
    search_fields = ("name",)
    inlines = [CompanySettingsInline]


@admin.register(CompanySettings)
class CompanySettingsAdmin(admin.ModelAdmin):
    list_display = ("company", "office_start", "office_end", "late_after", "half_day_hours", "weekly_offs")
    list_select_related = ("company",)
    filter_horizontal = ("default_cc",)


@admin.register(OfficeLocation)
class OfficeLocationAdmin(admin.ModelAdmin):
    list_display = ("name", "company", "latitude", "longitude", "radius_m", "is_active")
    list_filter = ("is_active", "company")
    search_fields = ("name", "address")
    list_select_related = ("company",)


@admin.register(Holiday)
class HolidayAdmin(admin.ModelAdmin):
    list_display = ("name", "date", "company")
    list_filter = ("company",)
    date_hierarchy = "date"
    search_fields = ("name",)
    list_select_related = ("company",)
