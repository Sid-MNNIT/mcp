from typing import Optional, Dict, Any
import base64
import json as _jwt_json

from client.ask_jobsy.executor import run_pipeline
from client.ask_jobsy.memory import (
    get_conversation_context,
    save_conversation_turn,
)


# -------------------------------------------------
# Main Entrypoint
# -------------------------------------------------

async def handle_user_message(
    jwt: str,
    user_message: str,
    conversation_id: Optional[str],
    metadata: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Core brain of Ask Jobsy.

    Flow:
    User → ReAct agent (orchestrator) → Memory

    The agent decides on its own which tools to call (MCP tools + pipelines).
    """

    metadata = metadata or {}

    user_id = ""
    try:
        payload_part = jwt.split(".")[1]
        payload_part += "=" * (4 - len(payload_part) % 4)
        decoded = _jwt_json.loads(base64.b64decode(payload_part).decode("utf-8"))
        user_id = str(decoded.get("_id") or decoded.get("id") or decoded.get("sub") or "")
    except Exception as e:
        print(f"⚠️ Could not read user id from JWT: {e}")

    conversation_context = get_conversation_context(conversation_id, user_id)

    result = await run_pipeline(
        pipeline_name="react_agent",
        endpoint="/agent/react",
        args={"text": user_message, "history": conversation_context},
        jwt=jwt,
    )

    reply = result["response"]
    tools_used = result.get("tools_used", [])

    # NEVER save real email/job data into conversation history. The LLM will
    # repeat it as fact on every future turn, even for different users after
    # logout. If tools were used, save only a short neutral note.
    if tools_used:
        memory_note = f"Used {', '.join(sorted(set(tools_used)))} to answer."
    else:
        memory_note = reply

    save_conversation_turn(
        conversation_id=conversation_id,
        user_message=user_message,
        assistant_message=memory_note,
        user_id=user_id,
    )

    return {
        "response": reply,
        "conversation_id": conversation_id,
        "metadata": {"tools_used": tools_used},
    }
