# email_query_api.py
import os
import httpx
from typing import Optional


BASE_URL = os.getenv("BACKEND_URL", "http://localhost:5000")


async def query_emails_from_db(
    jwt: str,
    sender: Optional[str] = None,
    type: Optional[str] = None,
    folder: Optional[str] = None,
    keyword: Optional[str] = None,
    limit: int = 20,
) -> dict:
    """
    Query stored emails from MongoDB via the Node backend.
    Supports filtering by sender, type, folder, keyword.
    """
    payload = {}
    if sender:  payload["sender"] = sender
    if type:    payload["type"] = type
    if folder:  payload["folder"] = folder
    if keyword: payload["keyword"] = keyword
    payload["limit"] = limit

    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(
            f"{BASE_URL}/api/emails/query",
            json=payload,
            headers={
                "Authorization": f"Bearer {jwt}",
                "Content-Type": "application/json",
            },
        )

    if response.status_code != 200:
        raise RuntimeError(
            f"Email query failed ({response.status_code}): {response.text}"
        )

    return response.json()