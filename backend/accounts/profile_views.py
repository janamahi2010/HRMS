from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from rest_framework.response import Response
from rest_framework.views import APIView

from . import profile


class PersonOverviewView(APIView):
    """GET /api/people/<id>/overview/: the employee profile page in one request."""

    @extend_schema(summary="Employee profile: details, this month, balances, team", responses=OpenApiTypes.OBJECT)
    def get(self, request, pk: int):
        person = profile.get_visible_person(request.user, pk)
        return Response(profile.profile_overview(request.user, person))


class PersonActivityView(APIView):
    """GET /api/people/<id>/activity/: audit timeline about this person."""

    @extend_schema(summary="Activity timeline for an employee", responses=OpenApiTypes.OBJECT)
    def get(self, request, pk: int):
        person = profile.get_visible_person(request.user, pk)
        return Response(profile.activity(request.user, person))
