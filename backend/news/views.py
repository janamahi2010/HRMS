from django.db import transaction
from django.utils import timezone
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from core.pagination import StandardPagination
from core.permissions import IsAdminOrReadOnly

from .models import NewsPost
from .notify import email_everyone
from .serializers import NewsPostSerializer, delete_files


class NewsPagination(StandardPagination):
    page_size = 10


class NewsPostViewSet(viewsets.ModelViewSet):
    """Everyone in the company reads; admins post, edit, pin and delete."""

    serializer_class = NewsPostSerializer
    permission_classes = [IsAdminOrReadOnly]
    pagination_class = NewsPagination
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_permissions(self):
        if self.action == "seen":
            return [IsAuthenticated()]
        return super().get_permissions()

    def get_queryset(self):
        qs = (
            NewsPost.objects.filter(company_id=self.request.user.company_id)
            .select_related("author")
            .prefetch_related("images", "attachments")
        )
        cat = self.request.query_params.get("category")
        if cat in NewsPost.Category.values:
            qs = qs.filter(category=cat)
        return qs

    @extend_schema(parameters=[OpenApiParameter("category", str, enum=NewsPost.Category.values)])
    def list(self, request, *args, **kwargs):
        return super().list(request, *args, **kwargs)

    def perform_create(self, serializer):
        notify = serializer.validated_data.pop("email_everyone", False)
        post = serializer.save(company=self.request.user.company, author=self.request.user)
        from accounts.models import User
        from notifications.services import notify as bell

        bell(
            User.objects.filter(company_id=post.company_id, is_active=True),
            "news",
            f"{post.get_category_display()}: {post.title}",
            body=post.body[:140],
            link=f"/news#post-{post.id}",
            actor=self.request.user,
        )
        if notify:
            email_everyone(post)

    def perform_update(self, serializer):
        serializer.validated_data.pop("email_everyone", None)  # emails go out only for new posts
        serializer.save()

    def perform_destroy(self, instance):
        names = [img.image.name for img in instance.images.all()] + [a.file.name for a in instance.attachments.all()]
        instance.delete()
        transaction.on_commit(lambda: delete_files(names))

    def _unread_qs(self):
        u = self.request.user
        since = u.news_seen_at or u.created_at
        return self.get_queryset().filter(created_at__gt=since).exclude(author_id=u.id).order_by("-created_at")

    @extend_schema(responses=OpenApiTypes.OBJECT, summary="How many posts I haven't seen, and the newest one")
    @action(detail=False, methods=["get"])
    def unread(self, request):
        qs = self._unread_qs()
        latest = qs.first()
        return Response(
            {"count": qs.count(), "latest": self.get_serializer(latest).data if latest else None},
        )

    @extend_schema(request=None, responses={204: None}, summary="Mark all news as seen")
    @action(detail=False, methods=["post"])
    def seen(self, request):
        now = timezone.now()
        type(request.user).objects.filter(pk=request.user.pk).update(news_seen_at=now)
        from notifications.models import Notification

        Notification.objects.filter(recipient=request.user, kind="news", read_at__isnull=True).update(read_at=now)
        request.user.news_seen_at = now
        return Response(status=status.HTTP_204_NO_CONTENT)
