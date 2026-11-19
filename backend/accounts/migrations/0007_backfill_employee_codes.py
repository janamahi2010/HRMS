from django.db import migrations


def forwards(apps, schema_editor):
    """Give every existing person an ID, per company, in joining order: EMP001… and INT001… for interns."""
    User = apps.get_model("accounts", "User")
    company_ids = User.objects.exclude(company_id=None).values_list("company_id", flat=True).distinct()
    for cid in company_ids:
        people = User.objects.filter(company_id=cid).order_by("joining_date", "created_at", "id")
        # Joining date unknown -> after everyone with a date (Postgres sorts NULLs last ascending already).
        counters = {"EMP": 0, "INT": 0}
        taken = set(User.objects.filter(company_id=cid).exclude(employee_code="").values_list("employee_code", flat=True))
        for u in people:
            if u.employee_code:
                continue
            prefix = "INT" if u.role == "intern" else "EMP"
            while True:
                counters[prefix] += 1
                code = f"{prefix}{counters[prefix]:03d}"
                if code not in taken:
                    break
            taken.add(code)
            u.employee_code = code
            u.save(update_fields=["employee_code"])


class Migration(migrations.Migration):
    dependencies = [("accounts", "0006_employee_code")]
    operations = [migrations.RunPython(forwards, migrations.RunPython.noop)]
