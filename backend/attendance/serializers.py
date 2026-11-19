from rest_framework import serializers


class PunchSerializer(serializers.Serializer):
    """A GPS fix from the browser. Time is never accepted from the client."""

    # Optional only for people allowed to check in remotely (who may have location turned off).
    lat = serializers.FloatField(min_value=-90, max_value=90, required=False, allow_null=True)
    lng = serializers.FloatField(min_value=-180, max_value=180, required=False, allow_null=True)
    accuracy = serializers.FloatField(min_value=0, max_value=100_000, required=False, allow_null=True)

    def validate(self, attrs):
        if (attrs.get("lat") is None) != (attrs.get("lng") is None):
            raise serializers.ValidationError("Send both latitude and longitude, or neither.")
        return attrs


class WorkSummarySerializer(serializers.Serializer):
    date = serializers.DateField(required=False, help_text="Defaults to today (IST).")
    summary = serializers.CharField(max_length=2000, allow_blank=True, trim_whitespace=True)


class CalendarQuerySerializer(serializers.Serializer):
    year = serializers.IntegerField(min_value=2000, max_value=2100, required=False)
    month = serializers.IntegerField(min_value=1, max_value=12, required=False)
    user = serializers.IntegerField(required=False)


class TeamQuerySerializer(serializers.Serializer):
    date = serializers.DateField(required=False)
    search = serializers.CharField(required=False, allow_blank=True)
    office_location = serializers.IntegerField(required=False)
