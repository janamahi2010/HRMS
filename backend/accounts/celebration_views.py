from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from . import celebrations


class WishSerializer(serializers.Serializer):
    to_user = serializers.IntegerField()
    message = serializers.CharField(max_length=200, required=False, allow_blank=True, default="")


class CelebrationsView(APIView):
    """GET /api/celebrations/?days=14: today's birthdays (with wishes for the birthday person) + upcoming."""

    @extend_schema(parameters=[OpenApiParameter("days", int)], responses=OpenApiTypes.OBJECT)
    def get(self, request):
        try:
            days = int(request.query_params.get("days", 14))
        except ValueError:
            days = 14
        return Response(celebrations.celebrations(request.user, days, request))


class WishView(APIView):
    """POST /api/celebrations/wishes/: wish a colleague happy birthday (once per year; re-posting updates the note)."""

    @extend_schema(request=WishSerializer, responses=OpenApiTypes.OBJECT)
    def post(self, request):
        s = WishSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        wish = celebrations.send_wish(request.user, s.validated_data["to_user"], s.validated_data["message"])
        return Response({"id": wish.id, "message": wish.message}, status=status.HTTP_201_CREATED)
