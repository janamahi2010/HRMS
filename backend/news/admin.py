from django.contrib import admin

from .models import NewsImage, NewsPost


class NewsImageInline(admin.TabularInline):
    model = NewsImage
    extra = 0


@admin.register(NewsPost)
class NewsPostAdmin(admin.ModelAdmin):
    list_display = ("title", "company", "category", "is_pinned", "created_at")
    list_filter = ("category", "company")
    inlines = [NewsImageInline]
