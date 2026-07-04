from fastapi import FastAPI, Request, HTTPException
from pydantic import BaseModel
from typing import Optional, Dict, Any

from client.ask_jobsy.entrypoint import handle_user_message




app = FastAPI()


@app.middleware("http")
async def jwt_context_middleware(request: Request, call_next):
    auth = request.headers.get("authorization")
    request.state.jwt = None

    if auth and auth.startswith("Bearer "):
        request.state.jwt = auth[7:].strip()

    response = await call_next(request)
    return response



class ChatRequest(BaseModel):
    text: str
    conversation_id: Optional[str] = None
    metadata: Dict[str, Any] = {}


@app.post("/ask-jobsy")
async def ask_jobsy(request: Request, body: ChatRequest):
    """
    Entry point for Ask Jobsy chatbot.
    """

    if not request.state.jwt:
        raise HTTPException(status_code=401, detail="Missing JWT")

    print("🟢 /ask-jobsy called")
    print("JWT (first 20 chars):", request.state.jwt[:20])

    response = await handle_user_message(
        jwt=request.state.jwt,
        user_message=body.text,
        conversation_id=body.conversation_id,
        metadata=body.metadata,
    )

    return response


@app.api_route("/health", methods=["GET", "HEAD"])
async def health():
    """
    Health endpoint accepts HEAD too — UptimeRobot uses HEAD by default,
    and a GET-only endpoint returns 405 which UptimeRobot logs as down.
    """
    return {"status": "ok"}
