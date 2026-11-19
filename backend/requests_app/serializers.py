from rest_framework import serializers

from accounts.serializers import UserMiniSerializer
from core.approvals import can_decide

from .models import RegularizationRequest, RegularizationType


class RegularizationSerializer(serializers.ModelSerializer):
    user = UserMiniSerializer(read_only=True)
    approver = UserMiniSerializer(read_only=True)
    decided_by = UserMiniSerializer(read_only=True)
    type_label = serializers.CharField(source="get_type_display", read_only=True)
    check_in_time = serializers.TimeField(format="%H:%M", input_formats=["%H:%M", "%H:%M:%S"])
    check_out_time = serializers.TimeField(format="%H:%M", input_formats=["%H:%M", "%H:%M:%S"])
    reason = serializers.CharField(min_length=5, max_length=1000, trim_whitespace=True)
    attendance_status = serializers.CharField(read_only=True, allow_null=True)
    can_decide = serializers.SerializerMethodField()
    can_cancel = serializers.SerializerMethodField()

    class Meta:
        model = RegularizationRequest
        fields = (
            "id",
            "user",
            "date",
            "type",
            "type_label",
            "check_in_time",
            "check_out_time",
            "reason",
            "status",
            "approver",
            "decided_by",
            "decision_comment",
            "decided_at",
            "attendance_status",
            "can_decide",
            "can_cancel",
            "created_at",
        )
        read_only_fields = ("status", "decision_comment", "decided_at", "created_at")

    def get_can_decide(self, obj) -> bool:
        return can_decide(self.context["request"].user, obj)

    def get_can_cancel(self, obj) -> bool:
        return obj.user_id == self.context["request"].user.id and obj.status == "pending"


class RegularizationCreateSerializer(serializers.Serializer):
    date = serializers.DateField()
    type = serializers.ChoiceField(choices=RegularizationType.choices)
    check_in_time = serializers.TimeField(input_formats=["%H:%M", "%H:%M:%S"])
    check_out_time = serializers.TimeField(input_formats=["%H:%M", "%H:%M:%S"])
    reason = serializers.CharField(min_length=5, max_length=1000, trim_whitespace=True)


class DecisionSerializer(serializers.Serializer):
    comment = serializers.CharField(max_length=500, required=False, allow_blank=True, default="")
