from django.utils import timezone
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from core.pagination import StandardPagination

from . import services
from .models import Notification


class NotificationSerializer(serializers.ModelSerializer):
    actor = serializers.SerializerMethodField()
    is_read = serializers.SerializerMethodField()

    class Meta:
        model = Notification
        fields = ("id", "kind", "title", "body", "link", "actor", "is_read", "created_at")

    def get_actor(self, obj) -> dict | None:
        a = obj.actor
        return {"id": a.id, "name": a.name} if a else None

    def get_is_read(self, obj) -> bool:
        return obj.read_at is not None


class NotificationPagination(StandardPagination):
    page_size = 15


class NotificationViewSet(mixins.ListModelMixin, mixins.DestroyModelMixin, viewsets.GenericViewSet):
    """The signed-in person's own notifications. Nobody can see anyone else's."""

    serializer_class = NotificationSerializer
    pagination_class = NotificationPagination

    def get_queryset(self):
        qs = Notification.objects.filter(recipient=self.request.user).select_related("actor")
        if self.action == "list" and self.request.query_params.get("filter") == "unread":
            qs = qs.filter(read_at__isnull=True)
        return qs

    @extend_schema(parameters=[OpenApiParameter("filter", str, enum=["all", "unread"])])
    def list(self, request, *args, **kwargs):
        services.ensure_daily(request.user)
        return super().list(request, *args, **kwargs)

    @extend_schema(responses=OpenApiTypes.OBJECT, summary="Unread count + the newest unread (for the bell and pop-ups)")
    @action(detail=False, methods=["get"])
    def summary(self, request):
        services.ensure_daily(request.user)
        unread = Notification.objects.filter(recipient=request.user, read_at__isnull=True)
        latest = unread.select_related("actor").first()
        return Response({"unread": unread.count(), "latest": NotificationSerializer(latest).data if latest else None})

    @extend_schema(request=None, responses=NotificationSerializer)
    @action(detail=True, methods=["post"])
    def read(self, request, pk=None):
        n = self.get_object()
        if n.read_at is None:
            n.read_at = timezone.now()
            n.save(update_fields=["read_at", "updated_at"])
        return Response(NotificationSerializer(n).data)

    @extend_schema(request=None, responses=NotificationSerializer)
    @action(detail=True, methods=["post"])
    def unread(self, request, pk=None):
        n = self.get_object()
        n.read_at = None
        n.save(update_fields=["read_at", "updated_at"])
        return Response(NotificationSerializer(n).data)

    @extend_schema(request=None, responses=OpenApiTypes.OBJECT)
    @action(detail=False, methods=["post"], url_path="read-all")
    def read_all(self, request):
        n = Notification.objects.filter(recipient=request.user, read_at__isnull=True).update(read_at=timezone.now())
        services.prune(request.user)
        return Response({"marked": n})

    @extend_schema(request=None, responses={204: None})
    @action(detail=False, methods=["post"], url_path="clear-read")
    def clear_read(self, request):
        Notification.objects.filter(recipient=request.user, read_at__isnull=False).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
