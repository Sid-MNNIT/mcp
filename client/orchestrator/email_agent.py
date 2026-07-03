from client.backend_client.agent_api import execute_tool
from client.wrappers.gmail_wrapper import clean_email_body
from client.orchestrator.email_prompt_builder import build_email_prompt
from client.orchestrator.email_mapper import (
    map_to_backend,
    map_to_backend_with_classification,
)
from client.backend_client.email_api import save_email, get_existing_email_ids
from client.llm.llm_service import generate_email_reply, classify_emails_batch

import json
import asyncio


def _unwrap_mcp_result(result, key):
    """Handle the two response shapes MCP tools can produce."""
    if isinstance(result, dict) and key in result:
        return result[key]
    if isinstance(result, dict) and result.get("type") == "text":
        payload = json.loads(result["text"])
        return payload.get(key)
    raise ValueError(f"Unexpected MCP response (missing '{key}'): {result}")

# ============================================================
# Draft email preview (READ-ONLY PIPELINE)
# ============================================================
async def prepare_email_reply_preview(
    message_id: str,
    tone: str,
    jwt: str
):
    print(f"🔵 prepare_email_reply_preview: message_id={message_id}, tone={tone}")
    # Decode userId from JWT to pass to MCP tool
    import base64 as _b64, json as _j
    try:
        payload_part = jwt.split(".")[1]
        payload_part += "=" * (4 - len(payload_part) % 4)
        decoded = _j.loads(_b64.b64decode(payload_part).decode("utf-8"))
        user_id = decoded.get("_id") or decoded.get("id") or decoded.get("sub")
    except Exception:
        user_id = None

    print(f"🔵 Resolved userId from JWT: {user_id}")

    result = await execute_tool(
        tool="draft_reply",
        args={
            "userId": str(user_id) if user_id else "",
            "message_id": message_id,
            "tone": tone
        },
        jwt=jwt
    )
    print(f"🟢 draft_reply tool result: {result}")

    # 🔓 MCP response unwrapping
    if "reply_context" in result:
        reply_context = result["reply_context"]
    elif result.get("type") == "text":
        payload = json.loads(result["text"])
        reply_context = payload["reply_context"]
    else:
        raise ValueError(f"Unexpected MCP response: {result}")

    for key in ("to", "subject", "threadId", "messageId", "originalEmail"):
        if key not in reply_context:
            raise ValueError(f"Missing {key} in reply_context")

    reply_context["originalEmail"]["body"] = clean_email_body(
        reply_context["originalEmail"].get("body", "")
    )

    prompt = build_email_prompt(reply_context)
    email_body = await asyncio.to_thread(
    generate_email_reply,
    prompt
    )  


    return {
        "draft": {
            "to": reply_context["to"],
            "subject": reply_context["subject"],
            "body": email_body,
            "threadId": reply_context["threadId"],
            "in_reply_to": reply_context["messageId"]
        }
    }


# ============================================================
# Send email with approval (WRITE PIPELINE)
# ============================================================
async def send_email_with_approval(draft: dict, jwt: str):
    for field in ("to", "subject", "body", "threadId", "in_reply_to"):
        if field not in draft:
            raise ValueError(f"Missing required draft field: {field}")

    result = await execute_tool(
        tool="send_email",
        args={
            "to": draft["to"],
            "subject": draft["subject"],
            "body": draft["body"],
            "threadId": draft["threadId"],
            "in_reply_to": draft["in_reply_to"]
        },
        jwt=jwt
    )

    if isinstance(result, dict):
        return result
    elif result.get("type") == "text":
        return json.loads(result["text"])
    else:
        raise ValueError(f"Unexpected MCP response: {result}")


# ============================================================
# Ingest and store emails (BACKGROUND PIPELINE)
#
# Two-phase design so we never spend bytes or LLM tokens on emails we
# already have:
#   Phase 1: list Gmail message IDs (cheap — no bodies).
#   Phase 2: dedupe against the local DB.
#   Phase 3: batch-fetch bodies for the fresh IDs (one HTTP call).
#   Phase 4: batch-classify with Groq (one call per ~10 emails).
#   Phase 5: persist.
# ============================================================
async def ingest_and_store_emails(jwt: str = None, user_id: str = None):
    if not jwt and not user_id:
        raise RuntimeError("Either JWT or user_id is required")

    # ── Phase 1: list Gmail IDs (no bodies) ─────────────────────────────
    refs_result = await execute_tool(
        tool="list_recent_message_ids",
        args={},
        jwt=jwt,
        user_id=user_id,
    )
    refs = _unwrap_mcp_result(refs_result, "message_refs") or []
    all_ids = [r["id"] for r in refs if r.get("id")]

    if not all_ids:
        print("📭 [email_agent] Gmail returned no messages in the lookback window")
        return []

    # ── Phase 2: dedupe against local DB BEFORE any body downloads ──────
    existing_ids = get_existing_email_ids(all_ids, jwt=jwt, user_id=user_id)
    fresh_ids = [i for i in all_ids if i not in existing_ids]

    skipped = len(all_ids) - len(fresh_ids)
    if skipped > 0:
        print(
            f"⏭️  [email_agent] Skipping {skipped}/{len(all_ids)} "
            f"already-stored emails (no Gmail body downloaded, no Groq call)"
        )

    if not fresh_ids:
        return []

    # ── Phase 3: batched full-body fetch for fresh IDs ──────────────────
    fetch_result = await execute_tool(
        tool="fetch_emails_by_ids",
        args={"message_ids": fresh_ids},
        jwt=jwt,
        user_id=user_id,
    )
    emails = _unwrap_mcp_result(fetch_result, "emails") or []

    if not emails:
        return []

    # Clean HTML/quoted-reply noise from bodies before classification —
    # keeps Groq prompts focused on the real content.
    for e in emails:
        e["body"] = clean_email_body(e.get("body", ""))

    # ── Phase 4: batch-classify via Groq ────────────────────────────────
    classifications = classify_emails_batch(emails)

    # ── Phase 5: map + save ─────────────────────────────────────────────
    stored = []
    for email, classification in zip(emails, classifications):
        payload = map_to_backend_with_classification(email, classification)
        if payload is None:
            continue

        # Normalize date (defensive — mapper already isoformats)
        if hasattr(payload.get("date"), "isoformat"):
            payload["date"] = payload["date"].isoformat()

        stored_email = save_email(payload, jwt=jwt, user_id=user_id)
        stored.append(stored_email)

    print(
        f"✅ [email_agent] Ingested {len(stored)} new job email(s) "
        f"from {len(fresh_ids)} fresh Gmail message(s)"
    )
    return stored




async def run_ingest_pipeline():
    """
    Manually runs Gmail ingest pipeline.
    Fill JWT manually before running.
    """

    JWT = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJfaWQiOiI2OTY4YWIyZDM2NWI3NDFjMGVhNzBiMjEiLCJlbWFpbCI6Im1haGVzaEBleGFtcGxlLmNvbSIsImZ1bGxuYW1lIjoiTWFoZXNoIiwiaWF0IjoxNzY4NDY3Mjk3LCJleHAiOjE3Njg1NTM2OTd9.CTXHBAMPAlTP-P7lwPH9SHxuiL7xFHur6-0dVIh4O_c"
    if not JWT or JWT == "PASTE_YOUR_JWT_HERE":
        raise RuntimeError("❌ Please set JWT before running ingest pipeline")

    print("🚀 Starting Gmail ingest pipeline...")
    stored_emails = await ingest_and_store_emails(jwt=JWT)

    print(f"✅ Ingest complete. Stored {len(stored_emails)} emails.")
    return stored_emails


# ============================================================
# Entry point
# ============================================================
if __name__ == "__main__":
    asyncio.run(run_ingest_pipeline())
    
