import os
import httpx
from datetime import datetime, timedelta
from collections import defaultdict

BASE_URL = os.getenv("BACKEND_URL", "http://localhost:5000")


async def _fetch_all_emails(jwt: str, limit: int = 500) -> list:
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(
            f"{BASE_URL}/api/emails/query",
            json={"limit": limit},
            headers={
                "Authorization": f"Bearer {jwt}",
                "Content-Type": "application/json",
            },
        )
    if response.status_code != 200:
        raise RuntimeError(
            f"Email fetch failed ({response.status_code}): {response.text}"
        )
    return response.json().get("emails", [])


async def get_application_stats(jwt: str, period: str = "all") -> dict:
    """
    Infer application stats from email types.
    Groups emails by company (sender domain) and determines status
    based on the most recent email type from that company.

    Status hierarchy: OFFER > INTERVIEW > REJECTION > JOB (applied)
    """
    emails = await _fetch_all_emails(jwt)

    # Filter by period
    cutoff_map = {
        "today": datetime.utcnow() - timedelta(days=1),
        "week":  datetime.utcnow() - timedelta(days=7),
        "month": datetime.utcnow() - timedelta(days=30),
        "all":   None,
    }
    cutoff = cutoff_map.get(period)
    if cutoff:
        filtered = []
        for e in emails:
            try:
                d = datetime.fromisoformat(
                    e["date"].replace("Z", "+00:00")
                ).replace(tzinfo=None)
                if d >= cutoff:
                    filtered.append(e)
            except Exception:
                filtered.append(e)
        emails = filtered

    # Group emails by sender domain → company
    company_emails = defaultdict(list)
    for e in emails:
        sender = e.get("from", "")
        # Extract domain as company identifier e.g. "noreply@amazon.com" → "amazon"
        try:
            domain = sender.split("@")[1].split(".")[0].lower()
        except Exception:
            domain = sender.lower()[:20]
        company_emails[domain].append(e)

    # Determine status per company from most recent email type
    STATUS_PRIORITY = {"OFFER": 4, "INTERVIEW": 3, "REJECTION": 2, "JOB": 1, "OTHER": 0}
    applications = []
    status_counts = {"OFFER": 0, "INTERVIEW": 0, "REJECTION": 0, "APPLIED": 0}

    for company, mails in company_emails.items():
        # Sort by date descending
        mails_sorted = sorted(
            mails,
            key=lambda x: x.get("date", ""),
            reverse=True
        )
        # Highest priority type across all emails from this company
        best_type = max(
            (m.get("type", "OTHER") for m in mails_sorted),
            key=lambda t: STATUS_PRIORITY.get(t, 0),
        )
        latest_email = mails_sorted[0]
        status = best_type if best_type != "OTHER" else "APPLIED"

        applications.append({
            "company": company,
            "status": status,
            "emailCount": len(mails),
            "lastContact": latest_email.get("date"),
            "lastSubject": latest_email.get("subject", ""),
        })

        if status in status_counts:
            status_counts[status] += 1
        else:
            status_counts["APPLIED"] += 1

    # Sort: OFFER first, then INTERVIEW, REJECTION, APPLIED
    applications.sort(
        key=lambda x: STATUS_PRIORITY.get(x["status"], 0),
        reverse=True,
    )

    return {
        "period": period,
        "totalCompanies": len(applications),
        "applications": applications,
        "summary": status_counts,
    }


async def get_followup_needed(jwt: str, days: int = 7) -> dict:
    """
    Find companies where the last email was more than N days ago
    and there's been no reply (no OFFER/INTERVIEW/REJECTION since).
    These are candidates for a follow-up.
    """
    emails = await _fetch_all_emails(jwt)

    cutoff = datetime.utcnow() - timedelta(days=days)

    company_emails = defaultdict(list)
    for e in emails:
        sender = e.get("from", "")
        try:
            domain = sender.split("@")[1].split(".")[0].lower()
        except Exception:
            domain = sender.lower()[:20]
        company_emails[domain].append(e)

    followup_needed = []

    for company, mails in company_emails.items():
        mails_sorted = sorted(
            mails, key=lambda x: x.get("date", ""), reverse=True
        )
        latest = mails_sorted[0]

        try:
            last_date = datetime.fromisoformat(
                latest["date"].replace("Z", "+00:00")
            ).replace(tzinfo=None)
        except Exception:
            continue

        # Only suggest follow-up if last contact was older than cutoff
        # and there's no OFFER or REJECTION (still active)
        types_seen = {m.get("type") for m in mails}
        still_active = "OFFER" not in types_seen and "REJECTION" not in types_seen

        if last_date < cutoff and still_active:
            days_since = (datetime.utcnow() - last_date).days
            followup_needed.append({
                "company": company,
                "lastContact": latest["date"],
                "daysSince": days_since,
                "lastSubject": latest.get("subject", ""),
                "emailCount": len(mails),
            })

    # Sort by most overdue first
    followup_needed.sort(key=lambda x: x["daysSince"], reverse=True)

    return {
        "count": len(followup_needed),
        "days": days,
        "companies": followup_needed,
    }