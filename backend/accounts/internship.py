"""Intern role: internship period and "days left".

Only users with role=intern have internship dates. Everything time-based is computed in IST.
"""

from datetime import date

from attendance.services import today_ist
from core.constants import Role

ENDING_SOON_DAYS = 14


def internship_info(user, today: date | None = None) -> dict | None:
    """Period, progress and status for an intern; None for every other role."""
    if user.role != Role.INTERN:
        return None
    today = today or today_ist()
    start = user.internship_start or user.joining_date
    end = user.internship_end
    if end is None:
        status = "upcoming" if start and start > today else "ongoing"
        return {"start": start, "end": None, "days_left": None, "total_days": None, "progress": None, "status": status}

    days_left = (end - today).days  # 0 = last day today; negative = ended
    total = (end - start).days + 1 if start else None
    if start and start > today:
        status, progress = "upcoming", 0
    elif days_left < 0:
        status, progress = "ended", 100
    else:
        status = "ending_soon" if days_left <= ENDING_SOON_DAYS else "active"
        progress = round(min(100, max(0, ((today - start).days + 1) * 100 / total))) if total else None
    return {
        "start": start,
        "end": end,
        "days_left": days_left,
        "total_days": total,
        "progress": progress,
        "status": status,
    }
