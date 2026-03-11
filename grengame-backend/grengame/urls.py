"""
URL configuration for grengame project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/5.2/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from django.db import connection
from django.db.utils import OperationalError
from django.http import JsonResponse
from core.views import AvailableBadgesView, UserBadgesView, UserStatsView


def health_check(request):
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
        return JsonResponse({"status": "ok", "database": "ok"}, status=200)
    except OperationalError:
        return JsonResponse(
            {"status": "degraded", "database": "unavailable"},
            status=503,
        )


urlpatterns = [
    path('health/', health_check, name='health-check'),
    path('admin/', admin.site.urls),
    path('auth/', include('core.urls')),
    path('gamification/progress/', UserStatsView.as_view(), name='gamification-progress'),
    path('gamification/badges/', UserBadgesView.as_view(), name='gamification-badges'),
    path('gamification/badges/available/', AvailableBadgesView.as_view(), name='gamification-badges-available'),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
