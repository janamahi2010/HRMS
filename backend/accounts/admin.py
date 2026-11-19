from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from .models import User


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    ordering = ("name",)
    list_display = ("name", "email", "company", "role", "manager", "is_active")
    list_filter = ("role", "is_active", "company")
    search_fields = ("name", "email")
    list_select_related = ("company", "manager")
    autocomplete_fields = ("manager", "office_location")
    fieldsets = (
        (None, {"fields": ("email", "password")}),
        ("Profile", {"fields": ("name", "phone", "designation", "joining_date")}),
        ("Organisation", {"fields": ("company", "role", "manager", "office_location")}),
        ("Permissions", {"fields": ("is_active", "is_staff", "is_superuser", "groups", "user_permissions")}),
        ("Dates", {"fields": ("last_login",)}),
    )
    add_fieldsets = (
        (None, {"classes": ("wide",), "fields": ("email", "name", "company", "role", "password1", "password2")}),
    )
