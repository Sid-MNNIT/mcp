from typing import Dict, Any
import httpx
import os
import base64
import json as _json

ORCHESTRATOR_URL = "http://localhost:9000"
_SERVICE_KEY = os.getenv("SERVICE_KEY", "abcd12345")

# Pipelines that do multiple heavy operations (GPT + DB + API calls)
# and need more than the default timeout
HEAVY_PIPELINES = {
    "interview_prep",    # resume fetch + email fetch + GPT
    "job_search",        # MCP job search API
    "job_recommendations", # profile fetch + job search + ranking
    "rank_jobs",         # ranking logic
}


async def run_pipeline(
    *,
    pipeline_name: str,
    endpoint: str,
    args: Dict[str, Any],
    jwt: str,
) -> Dict[str, Any]:
    """
    Execute a planner-decided pipeline by calling the orchestrator directly.
    Must NOT call back through Node (/api/ai/execute) — that creates an infinite loop.
    """

    if not endpoint:
        raise ValueError("endpoint is required to execute pipeline")

    if not jwt:
        raise ValueError("jwt is required to execute pipeline")

    # Decode userId from JWT and inject into args
    # All orchestrator pipelines require userId in the request body
    try:
        payload_part = jwt.split(".")[1]
        payload_part += "=" * (4 - len(payload_part) % 4)
        decoded = _json.loads(base64.b64decode(payload_part).decode("utf-8"))
        user_id = decoded.get("_id") or decoded.get("id") or decoded.get("sub")
        if user_id:
            args = {**args, "userId": str(user_id)}
    except Exception:
        pass  # If decode fails, proceed without userId

    url = f"{ORCHESTRATOR_URL}{endpoint}"

    headers = {
        "Authorization": f"Bearer {jwt}",
        "Content-Type": "application/json",
        "X-Service-Key": _SERVICE_KEY,
    }

    timeout = 180 if pipeline_name in HEAVY_PIPELINES else 90

    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.post(url, json=args, headers=headers)

    if response.status_code != 200:
        raise RuntimeError(
            f"Pipeline '{pipeline_name}' failed "
            f"({response.status_code}): {response.text}"
        )

    return response.json()
