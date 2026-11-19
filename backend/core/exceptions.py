"""Consistent JSON error format for every API error:

    {"error": {"code": "validation_error", "message": "Human readable", "fields": {...}, ...extra}}
"""

import logging

from django.core.exceptions import PermissionDenied as DjangoPermissionDenied
from django.core.exceptions import ValidationError as DjangoValidationError
from django.http import Http404
from rest_framework import exceptions, status
from rest_framework.response import Response
from rest_framework.views import exception_handler

logger = logging.getLogger(__name__)


class ServiceError(exceptions.APIException):
    """Raise from services.py for business-rule violations.

    `extra` is merged into the error payload (e.g. {"distance_m": 450}).
    """

    status_code = status.HTTP_400_BAD_REQUEST
    default_code = "business_rule"
    default_detail = "Request could not be completed."

    def __init__(self, message=None, code=None, extra=None, status_code=None):
        super().__init__(message or self.default_detail, code or self.default_code)
        self.code = code or self.default_code
        self.extra = extra or {}
        if status_code:
            self.status_code = status_code


def _first_message(detail):
    if isinstance(detail, list) and detail:
        return _first_message(detail[0])
    if isinstance(detail, dict) and detail:
        return _first_message(next(iter(detail.values())))
    return str(detail)


def api_exception_handler(exc, context):
    if isinstance(exc, DjangoValidationError):
        exc = exceptions.ValidationError(exc.message_dict if hasattr(exc, "message_dict") else exc.messages)
    elif isinstance(exc, Http404):
        exc = exceptions.NotFound()
    elif isinstance(exc, DjangoPermissionDenied):
        exc = exceptions.PermissionDenied()

    response = exception_handler(exc, context)
    if response is None:
        logger.exception("Unhandled API error", exc_info=exc)
        return Response(
            {"error": {"code": "server_error", "message": "Something went wrong. Please try again."}},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    if isinstance(exc, ServiceError):
        payload = {"code": exc.code, "message": str(exc.detail), **exc.extra}
    elif isinstance(exc, exceptions.ValidationError):
        detail = exc.detail
        fields = detail if isinstance(detail, dict) else {"non_field_errors": detail}
        non_field = fields.get("non_field_errors")
        message = _first_message(non_field) if non_field else "Please correct the highlighted fields."
        payload = {"code": "validation_error", "message": message, "fields": fields}
    else:
        detail = exc.detail if hasattr(exc, "detail") else str(exc)
        code = getattr(detail, "code", None) or getattr(exc, "default_code", "error")
        payload = {"code": code, "message": _first_message(detail)}
        if isinstance(exc, exceptions.Throttled) and exc.wait:
            payload["retry_after"] = int(exc.wait)

    response.data = {"error": payload}
    return response
