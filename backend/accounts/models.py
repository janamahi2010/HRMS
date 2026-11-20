from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models

from core.constants import Role
from core.models import TimeStampedModel


class UserManager(BaseUserManager):
    use_in_migrations = True

    def _create_user(self, email, password, **extra):
        if not email:
            raise ValueError("Email is required")
        email = self.normalize_email(email).lower()
        user = self.model(email=email, **extra)
        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()
        user.save(using=self._db)
        return user

    def create_user(self, email, password=None, **extra):
        extra.setdefault("is_staff", False)
        extra.setdefault("is_superuser", False)
        return self._create_user(email, password, **extra)

    def create_superuser(self, email, password=None, **extra):
        extra.setdefault("is_staff", True)
        extra.setdefault("is_superuser", True)
        extra.setdefault("role", Role.ADMIN)
        extra.setdefault("name", "Superuser")
        return self._create_user(email, password, **extra)


class User(AbstractBaseUser, PermissionsMixin, TimeStampedModel):
    """Custom user: email is the username. Every API user belongs to exactly one company.

    `company` is nullable only so platform superusers (Django admin) can exist without one;
    such users cannot use the API.
    """

    Role = Role

    email = models.EmailField(unique=True)
    name = models.CharField(max_length=150)
    # Company-unique staff ID, e.g. EMP007 / INT002 (auto-assigned; admins may override).
    employee_code = models.CharField(max_length=20, blank=True, db_index=True)
    phone = models.CharField(max_length=20, blank=True)
    designation = models.CharField(max_length=100, blank=True)
    role = models.CharField(max_length=10, choices=Role.choices, default=Role.EMPLOYEE)
    company = models.ForeignKey(
        "company.Company", on_delete=models.CASCADE, related_name="users", null=True, blank=True
    )
    manager = models.ForeignKey(
        "self", on_delete=models.SET_NULL, related_name="reports", null=True, blank=True
    )
    office_location = models.ForeignKey(
        "company.OfficeLocation", on_delete=models.SET_NULL, related_name="users", null=True, blank=True
    )
    joining_date = models.DateField(null=True, blank=True)
    # Only day + month are ever shown to colleagues; the year stays private (HR records only).
    date_of_birth = models.DateField(null=True, blank=True)
    # Intern role only (cleared when someone stops being an intern; the audit log keeps history).
    internship_start = models.DateField(null=True, blank=True)
    internship_end = models.DateField(null=True, blank=True)
    show_birthday = models.BooleanField(default=True, help_text="Celebrate my birthday on everyone's Home page.")
    # Set when an admin chose the password: the person must pick their own at next sign-in.
    # Profile photo (square, re-encoded on upload). Shown instead of initials.
    avatar = models.ImageField(upload_to="avatars/", blank=True, null=True)
    # Can check in / out from anywhere (work from home, field work). Location is still recorded when shared.
    remote_allowed = models.BooleanField(default=False)
    # Company news: posts after this time count as unread (null -> since they joined the app).
    news_seen_at = models.DateTimeField(null=True, blank=True)
    must_change_password = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)

    objects = UserManager()

    USERNAME_FIELD = "email"
    EMAIL_FIELD = "email"
    REQUIRED_FIELDS = []

    class Meta:
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(
                fields=["company", "employee_code"],
                condition=~models.Q(employee_code=""),
                name="uniq_employee_code_per_company",
            )
        ]
        indexes = [
            models.Index(fields=["company", "is_active"]),
            models.Index(fields=["company", "role"]),
            models.Index(fields=["manager"]),
        ]

    def __str__(self) -> str:
        return f"{self.name} <{self.email}>"

    @property
    def is_admin(self) -> bool:
        return self.role == Role.ADMIN

    @property
    def is_manager(self) -> bool:
        return self.role == Role.MANAGER

    def save(self, *args, **kwargs):
        self.email = (self.email or "").strip().lower()
        super().save(*args, **kwargs)


class BirthdayWish(TimeStampedModel):
    """A colleague's "Happy birthday!" One per sender, per recipient, per year."""

    company = models.ForeignKey("company.Company", on_delete=models.CASCADE, related_name="+")
    to_user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="birthday_wishes")
    from_user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="+")
    year = models.PositiveSmallIntegerField()
    message = models.CharField(max_length=200, blank=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [models.UniqueConstraint(fields=["to_user", "from_user", "year"], name="uniq_birthday_wish")]
        indexes = [models.Index(fields=["to_user", "year"])]

    def __str__(self) -> str:
        return f"{self.from_user_id} -> {self.to_user_id} ({self.year})"
