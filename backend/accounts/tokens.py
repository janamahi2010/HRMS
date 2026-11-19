"""Refresh-token rotation that survives interrupted page loads.

With ROTATE_REFRESH_TOKENS + BLACKLIST_AFTER_ROTATION, every refresh blacklists the token
that was presented and returns a new one. If the browser is interrupted between those two
moments (a reload followed by an immediate navigation, two tabs opening together, a flaky
network), the client is left holding only the blacklisted token and gets logged out.

This view accepts a token that was *rotated away* in the last REFRESH_GRACE_SECONDS and
issues a fresh pair. Tokens revoked on purpose (logout, password change, deactivation) are
marked expired in the outstanding-token table and never qualify.
"""

from datetime import timedelta

from django.conf import settings
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from rest_framework_simplejwt.state import token_backend
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenRefreshView

GRACE = timedelta(seconds=getattr(settings, "REFRESH_GRACE_SECONDS", 60))


def revoke_session(raw: str) -> None:
    """Logout: revoke the presented refresh token and any ancestor rotated away within the grace window,
    without touching the user's other devices."""
    try:
        payload = token_backend.decode(raw, verify=True)
    except Exception:  # noqa: BLE001 - expired/garbage token: nothing to revoke
        return
    from django.db.models import Q

    recent = Q(blacklistedtoken__blacklisted_at__gte=timezone.now() - GRACE)
    revoke_outstanding(
        OutstandingToken.objects.filter(user_id=payload.get("user_id")).filter(Q(jti=payload.get("jti")) | recent)
    )


def revoke_outstanding(tokens) -> int:
    """Blacklist + mark revoked so the grace window never applies. `tokens`: OutstandingToken queryset."""
    n = 0
    for t in tokens:
        BlacklistedToken.objects.get_or_create(token=t)
        n += 1
    tokens.update(expires_at=timezone.now())
    return n


class GraceTokenRefreshSerializer(TokenRefreshSerializer):
    def validate(self, attrs):
        try:
            return super().validate(attrs)
        except TokenError as exc:
            if "blacklist" not in str(exc).lower():
                raise
            data = self._reissue_within_grace(attrs["refresh"])
            if data is None:
                raise InvalidToken(str(exc)) from exc
            return data

    def _reissue_within_grace(self, raw: str):
        try:
            payload = token_backend.decode(raw, verify=True)  # signature + expiry, but not the blacklist
        except Exception:  # noqa: BLE001 - any decode problem means "not eligible"
            return None
        if payload.get("token_type") != "refresh":
            return None
        rotated_recently = (
            BlacklistedToken.objects.filter(
                token__jti=payload.get("jti"),
                token__user_id=payload.get("user_id"),
                token__expires_at__gt=timezone.now(),  # revoke_outstanding() zeroes this on purpose
                blacklisted_at__gte=timezone.now() - GRACE,
            )
            .exists()
        )
        if not rotated_recently:
            return None
        user = get_user_model().objects.filter(pk=payload.get("user_id"), is_active=True).first()
        if user is None:
            return None
        fresh = RefreshToken.for_user(user)
        return {"access": str(fresh.access_token), "refresh": str(fresh)}


class GraceTokenRefreshView(TokenRefreshView):
    serializer_class = GraceTokenRefreshSerializer

