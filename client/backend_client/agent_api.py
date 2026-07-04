import httpx
import os
SERVICE_KEY = os.getenv("SERVICE_KEY", "")

BASE_URL = os.getenv("BACKEND_URL", "http://localhost:5000")

async def execute_tool(tool: str, args: dict, jwt: str = None, user_id: str = None):
    """
    Execute MCP tool - handles both user (JWT) and cron (user_id) flows
    """

    if not jwt and not user_id:
        raise RuntimeError("Either JWT or user_id is required for execute_tool")

    source = "cron" if (user_id and not jwt) else "user"

    if source == "cron":
        print(f"🤖 [CRON] Executing tool: {tool} for user: {user_id}")
    else:
        print(f"👤 [USER] Executing tool: {tool} with JWT")

    headers = {
        "Content-Type": "application/json",
        "X-Service-Key": SERVICE_KEY,
    }

    if jwt:
        headers["Authorization"] = f"Bearer {jwt}"

    if user_id:
        headers["X-User-Id"] = str(user_id)

    if source == "cron":
        headers["X-Request-Source"] = "cron"

    payload = {
        "tool": tool,
        "args": args
    }

    if user_id:
        payload["userId"] = user_id

    # Bumped 60s → 120s. On free-tier CPU, Gmail fetch + Groq classification
    # for even 15 messages can push past a minute.
    async with httpx.AsyncClient(timeout=120) as client:
        res = await client.post(
            f"{BASE_URL}/api/emails/execute",
            json=payload,
            headers=headers
        )

    if res.status_code >= 400:
        print("\n🔴 BACKEND ERROR RESPONSE")
        print("Status:", res.status_code)
        print("Body:", res.text)
        raise RuntimeError("Backend agent execution failed")

    return res.json()