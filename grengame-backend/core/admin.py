from django.contrib import admin

from .models import GamificationLevel


@admin.register(GamificationLevel)
class GamificationLevelAdmin(admin.ModelAdmin):
    list_display = (
        "position",
        "name",
        "min_xp",
        "min_completed_games",
        "is_active",
    )
    list_filter = ("is_active",)
    search_fields = ("name",)
    ordering = ("position", "id")
    list_editable = ("min_xp", "min_completed_games", "is_active")
