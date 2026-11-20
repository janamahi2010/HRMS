from django.urls import path

from . import views
from .tokens import GraceTokenRefreshView

urlpatterns = [
    path("login/", views.LoginView.as_view(), name="login"),
    path("signup/", views.SignupView.as_view(), name="signup"),
    path("refresh/", GraceTokenRefreshView.as_view(), name="token-refresh"),
    path("logout/", views.LogoutView.as_view(), name="logout"),
    path("me/", views.MeView.as_view(), name="me"),
    path("me/avatar/", views.MyAvatarView.as_view(), name="me-avatar"),
    path("password/forgot/", views.ForgotPasswordView.as_view(), name="password-forgot"),
    path("password/validate/", views.ValidateResetTokenView.as_view(), name="password-validate"),
    path("password/reset/", views.ResetPasswordView.as_view(), name="password-reset"),
    path("password/change/", views.ChangePasswordView.as_view(), name="password-change"),
]
