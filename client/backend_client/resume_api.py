import os
import httpx

BASE_URL = os.getenv("BACKEND_URL", "http://localhost:5000")


async def get_user_resume(jwt: str) -> dict:
    """
    Fetch the user's parsed resume from MongoDB via Node backend.
    Returns parsed_resume dict with skills, experience, sections etc.
    Returns empty dict if not found.
    """
    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.get(
            f"{BASE_URL}/api/resume",
            headers={
                "Authorization": f"Bearer {jwt}",
                "Content-Type": "application/json",
            },
        )

    if response.status_code != 200:
        return {}

    data = response.json()
    return data.get("data", {})
