import httpx
from datetime import datetime, timedelta

BASE_URL = "http://localhost:5000"


async def get_upcoming_calendar_events(jwt: str, days: int = 30) -> list:
    """
    Fetch upcoming calendar events from MongoDB for the next N days.
    """
    start = datetime.utcnow()
    end = start + timedelta(days=days)

    params = {
        "start": start.isoformat() + "Z",
        "end": end.isoformat() + "Z",
    }

    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.get(
            f"{BASE_URL}/api/calendar/events",
            params=params,
            headers={
                "Authorization": f"Bearer {jwt}",
                "Content-Type": "application/json",
            },
        )

    if response.status_code != 200:
        raise RuntimeError(
            f"Calendar events fetch failed ({response.status_code}): {response.text}"
        )

    data = response.json()
    return data.get("data", {}).get("events", [])
