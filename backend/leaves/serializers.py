from decimal import Decimal

from rest_framework import serializers

from accounts.serializers import UserMiniSerializer
from core.approvals import can_decide

from .models import HalfDaySession, LeaveBalance, LeaveRequest, LeaveType


class LeaveTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = LeaveType
        fields = ("id", "name", "yearly_quota", "allow_half_day", "is_paid", "color", "is_active", "accrual")

    def validate_name(self, value):
        value = value.strip()
        company_id = self.context["request"].user.company_id
        qs = LeaveType.objects.filter(company_id=company_id, name__iexact=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        clash = qs.first()
        if clash and clash.for_interns:
            raise serializers.ValidationError(f"\"{clash.name}\" is used for interns' leave. Pick another name.")
        if clash:
            raise serializers.ValidationError("A leave type with this name already exists.")
        return value

    def validate(self, attrs):
        is_paid = attrs.get("is_paid", getattr(self.instance, "is_paid", True))
        if not is_paid:
            attrs["yearly_quota"] = 0
            attrs["accrual"] = "yearly"  # nothing to spread out
        return attrs


class LeaveTypeMiniSerializer(serializers.ModelSerializer):
    class Meta:
        model = LeaveType
        fields = ("id", "name", "color", "is_paid", "allow_half_day", "for_interns", "accrual", "yearly_quota")


class LeaveBalanceSerializer(serializers.ModelSerializer):
    leave_type = LeaveTypeMiniSerializer(read_only=True)
    available = serializers.DecimalField(max_digits=5, decimal_places=1, read_only=True)

    class Meta:
        model = LeaveBalance
        fields = ("id", "leave_type", "year", "total", "used", "available")


class LeaveRequestSerializer(serializers.ModelSerializer):
    user = UserMiniSerializer(read_only=True)
    approver = UserMiniSerializer(read_only=True)
    decided_by = UserMiniSerializer(read_only=True)
    leave_type = LeaveTypeMiniSerializer(read_only=True)
    cc_users = UserMiniSerializer(many=True, read_only=True)
    can_decide = serializers.SerializerMethodField()
    can_cancel = serializers.SerializerMethodField()
    is_cc = serializers.SerializerMethodField()

    class Meta:
        model = LeaveRequest
        fields = (
            "id",
            "user",
            "leave_type",
            "from_date",
            "to_date",
            "is_half_day",
            "half",
            "days",
            "reason",
            "status",
            "approver",
            "decided_by",
            "decision_comment",
            "decided_at",
            "cc_users",
            "can_decide",
            "can_cancel",
            "is_cc",
            "created_at",
        )

    def _me(self):
        return self.context["request"].user

    def get_can_decide(self, obj) -> bool:
        return can_decide(self._me(), obj)

    def get_can_cancel(self, obj) -> bool:
        from attendance.services import today_ist

        if obj.user_id != self._me().id:
            return False
        return obj.status == "pending" or (obj.status == "approved" and obj.from_date > today_ist())

    def get_is_cc(self, obj) -> bool:
        me = self._me().id
        return any(u.id == me for u in obj.cc_users.all())


class LeaveApplySerializer(serializers.Serializer):
    leave_type = serializers.IntegerField(required=False, allow_null=True)  # not needed for interns
    from_date = serializers.DateField()
    to_date = serializers.DateField()
    is_half_day = serializers.BooleanField(default=False)
    half = serializers.ChoiceField(choices=HalfDaySession.choices, required=False, allow_blank=True, default="")
    reason = serializers.CharField(min_length=3, max_length=1000, trim_whitespace=True)
    cc_ids = serializers.ListField(child=serializers.IntegerField(), required=False, default=list, max_length=20)

    def to_service(self) -> dict:
        d = dict(self.validated_data)
        d["leave_type_id"] = d.pop("leave_type", None)
        return d


class LeavePreviewSerializer(serializers.Serializer):
    leave_type = serializers.IntegerField(required=False, allow_null=True)  # not needed for interns
    from_date = serializers.DateField()
    to_date = serializers.DateField()
    is_half_day = serializers.BooleanField(default=False)
    half = serializers.CharField(required=False, allow_blank=True, default="")


class BalanceAdjustSerializer(serializers.Serializer):
    user = serializers.IntegerField()
    leave_type = serializers.IntegerField()
    year = serializers.IntegerField(min_value=2000, max_value=2100)
    delta = serializers.DecimalField(max_digits=5, decimal_places=1)
    reason = serializers.CharField(min_length=3, max_length=300)

    def validate_delta(self, v):
        if v % Decimal("0.5"):
            raise serializers.ValidationError("Use whole or half days.")
        return v
