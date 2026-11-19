from django.db import models


class Role(models.TextChoices):
    ADMIN = "admin", "Admin"
    MANAGER = "manager", "Manager"
    EMPLOYEE = "employee", "Employee"
    INTERN = "intern", "Intern"


# Roles that only see their own data and whose requests go to their manager.
INDIVIDUAL_ROLES = (Role.EMPLOYEE, Role.INTERN)


class RequestStatus(models.TextChoices):
    """Shared lifecycle for leave and regularization requests."""

    PENDING = "pending", "Pending"
    APPROVED = "approved", "Approved"
    REJECTED = "rejected", "Rejected"
    CANCELLED = "cancelled", "Cancelled"
