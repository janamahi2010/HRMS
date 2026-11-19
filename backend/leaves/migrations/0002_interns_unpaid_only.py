from django.db import migrations
from django.db.models import F


def forwards(apps, schema_editor):
    """Interns are unpaid: paid balances shrink to what they've already used."""
    LeaveBalance = apps.get_model("leaves", "LeaveBalance")
    LeaveBalance.objects.filter(user__role="intern", leave_type__is_paid=True).update(total=F("used"))


class Migration(migrations.Migration):
    dependencies = [("leaves", "0001_initial"), ("accounts", "0005_admin_passwords")]
    operations = [migrations.RunPython(forwards, migrations.RunPython.noop)]
