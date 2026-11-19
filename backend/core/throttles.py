from rest_framework.throttling import AnonRateThrottle, UserRateThrottle


class LoginThrottle(AnonRateThrottle):
    scope = "login"


class PasswordResetThrottle(AnonRateThrottle):
    """Sending reset/invite emails: tight, it's the abusable step."""

    scope = "password_reset"


class PasswordTokenThrottle(AnonRateThrottle):
    """Validating/using a reset or invite link: looser, because a whole office shares one IP
    (e.g. ten new joiners setting passwords on the same morning)."""

    scope = "password_token"


class SignupThrottle(AnonRateThrottle):
    scope = "signup"


class CheckInThrottle(UserRateThrottle):
    scope = "check_in"
