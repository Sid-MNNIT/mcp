import os
from typing import Dict,Any
import httpx

BASE_URL = os.getenv("BACKEND_URL", "http://localhost:5000")


async def execute_ai_pipeline(
    *,
    endpoint: str,
    args: Dict[str, Any],
    jwt: str,
) -> Dict[str, Any]:
    """
    Call backend AI execute route with planner output.
    """

    if not endpoint:
        raise ValueError("endpoint is required")

    if not jwt:
        raise ValueError("jwt is required")

    url = f"{BASE_URL}/api/ai/execute"

    headers = {
        "Authorization": f"Bearer {jwt}",
        "Content-Type": "application/json",
    }

    payload = {
        "endpoint": endpoint,
        "args": args,
    }

    async with httpx.AsyncClient(timeout=60) as client:
        response = await client.post(
            url,
            json=payload,
            headers=headers,
        )

    if response.status_code != 200:
        raise RuntimeError(
            f"AI execute failed "
            f"({response.status_code}): {response.text}"
        )

    return response.json()
