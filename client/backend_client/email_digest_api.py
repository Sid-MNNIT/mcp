import os
import httpx
from datetime import datetime, timedelta

BASE_URL = os.getenv("BACKEND_URL", "http://localhost:5000")


async def fetch_emails_for_digest(jwt: str, period: str = "week") -> dict:
    """
    Fetch emails and group by type for digest summarisation.
    period: "today" | "week" | "month" | "all"
    """
    limit_map = {"today": 50, "week": 100, "month": 200, "all": 500}
    limit = limit_map.get(period, 100)

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
        raise RuntimeError(f"Digest fetch failed ({response.status_code}): {response.text}")

    emails = response.json().get("emails", [])

    # Filter by date on Python side
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
                email_date = datetime.fromisoformat(
                    e["date"].replace("Z", "+00:00")
                ).replace(tzinfo=None)
                if email_date >= cutoff:
                    filtered.append(e)
            except Exception:
                filtered.append(e)
        emails = filtered

    # Group by type
    grouped = {"JOB": [], "INTERVIEW": [], "OFFER": [], "REJECTION": [], "OTHER": []}
    for e in emails:
        t = e.get("type", "OTHER")
        grouped[t if t in grouped else "OTHER"].append(e)

    return {
        "period": period,
        "total": len(emails),
        "grouped": grouped,
        "counts": {k: len(v) for k, v in grouped.items()},
    }