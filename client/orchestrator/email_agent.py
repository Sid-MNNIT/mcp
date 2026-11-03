from client.backend_client.agent_api import execute_tool
from client.wrappers.gmail_wrapper import clean_email_body
from client.orchestrator.email_prompt_builder import build_email_prompt
from client.orchestrator.email_mapper import (
    ALLOWED_TYPES,
    map_to_backend,
    map_to_backend_with_classification,
    map_to_pending_payload,
)
from client.backend_client.email_api import save_email, get_existing_email_ids, get_pending_emails
from client.llm.llm_service import generate_email_reply, classify_emails_batch

import json
import asyncio


def _unwrap_mcp_result(result, key):
    """
    Handle every MCP response shape we've seen:
      1. Direct dict:                    {"message_refs": [...]}
      2. Single text block:              {"type": "text", "text": "<json>"}
      3. Content list (modern MCP):      {"content": [{"type": "text", "text": "<json>"}]}
      4. Error text (tool raised):       {"content": [{"type": "text", "text": "Error: ..."}]}
                                         or plain string
    Empty/missing text is treated as no data, not as a hard crash — so the
    caller can decide (e.g. "no new emails" is fine, "Gmail not connected"
    surfaces with a clear error).
    """
    print(f"🔎 [MCP] raw result (first 300 chars): {str(result)[:300]}")

    if not isinstance(result, dict):
        raise ValueError(f"MCP result is not a dict: {type(result).__name__}")

    # 1. Direct dict already has the key.
    if key in result:
        return result[key]

    # 2. Extract text payload from whichever wrapper we got.
    text = None
    if result.get("type") == "text":
        text = result.get("text")
    elif isinstance(result.get("content"), list) and result["content"]:
        first = result["content"][0]
        if isinstance(first, dict) and first.get("type") == "text":
            text = first.get("text")

    if not text or not text.strip():
        # Tool ran but returned nothing — treat as no data for this key.
        print(f"⚠️ [MCP] empty text payload for key '{key}'; full result: {result}")
        return None

    # If the text looks like a plain error message (starts with "Error"),
    # surface it clearly.
    stripped = text.strip()
    if stripped.startswith(("Error", "error", "{'error'", "{\"error\"")) and not stripped.startswith("{"):
        raise RuntimeError(f"MCP tool returned an error: {stripped}")

    try:
        payload = json.loads(stripped)
    except json.JSONDecodeError as e:
        raise ValueError(
            f"MCP tool returned non-JSON payload: {stripped[:200]!r}"
        ) from e

    if not isinstance(payload, dict):
        raise ValueError(f"MCP payload is not a dict: {payload!r}")

    return payload.get(key)

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
async def fetch_new_emails(jwt: str = None, user_id: str = None):
    """
    Phases 1-3: list Gmail IDs, drop the ones we already have, then download
    and clean the rest. Returns a list of emails (empty if nothing is new).
    """
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

    return emails


async def ingest_and_store_emails(jwt: str = None, user_id: str = None):
    if not jwt and not user_id:
        raise RuntimeError("Either JWT or user_id is required")

    # ── Phases 1-3: list, dedupe, download ──────────────────────────────
    emails = await fetch_new_emails(jwt=jwt, user_id=user_id)
    if not emails:
        return []

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
        f"from {len(emails)} fresh Gmail message(s)"
    )
    return stored


# ============================================================
# Queue-based sync (used by the Node email-sync worker)
#
# The same work as ingest_and_store_emails, but cut in two so the
# user sees new emails quickly:
#   1. save_new_emails_as_pending  -> Gmail to DB, no Groq, type PENDING
#   2. classify_pending_emails     -> Groq decides the real type
# ============================================================
async def save_new_emails_as_pending(jwt: str = None, user_id: str = None, last_history_id: str = None):
    if not jwt and not user_id:
        raise RuntimeError("Either JWT or user_id is required")

    # Cheap check first. Read the historyId BEFORE fetching, so a mail that
    # arrives while we work changes the number and is picked up next time.
    history_result = await execute_tool(
        tool="get_history_id",
        args={},
        jwt=jwt,
        user_id=user_id,
    )
    history_id = str(_unwrap_mcp_result(history_result, "historyId"))

    if last_history_id and history_id == str(last_history_id):
        print(f"⏭️  [email_agent] Mailbox unchanged since last sync (historyId {history_id})")
        return {"skipped": True, "historyId": history_id, "saved": 0}

    emails = await fetch_new_emails(jwt=jwt, user_id=user_id)

    for email in emails:
        save_email(map_to_pending_payload(email), jwt=jwt, user_id=user_id)

    print(f"💾 [email_agent] Saved {len(emails)} new email(s) as PENDING")
    return {"skipped": False, "historyId": history_id, "saved": len(emails)}


async def classify_pending_emails(jwt: str = None, user_id: str = None):
    if not jwt and not user_id:
        raise RuntimeError("Either JWT or user_id is required")

    pending = get_pending_emails(jwt=jwt, user_id=user_id)
    if not pending:
        return {"classified": 0, "hidden": 0}

    # classify_emails_batch reads "subject" and "body"; our DB calls it "text"
    to_classify = [
        {"subject": e.get("subject", ""), "body": e.get("text", "")}
        for e in pending
    ]
    results = classify_emails_batch(to_classify)

    classified = 0
    hidden = 0
    for stored, result in zip(pending, results):
        payload = {
            key: stored.get(key)
            for key in ("emailId", "threadId", "from", "subject", "text", "date", "folder")
        }

        if result.get("is_relevant"):
            email_type = (result.get("type") or "OTHER").upper()
            payload["type"] = email_type if email_type in ALLOWED_TYPES else "OTHER"
            classified += 1
        else:
            # Not a real job email. Keep a hidden record so the next sync
            # does not download and classify it all over again.
            payload["type"] = "OTHER"
            payload["deletedByUser"] = True
            hidden += 1

        save_email(payload, jwt=jwt, user_id=user_id)

    print(f"🏷️  [email_agent] Classified {classified} email(s), hid {hidden} non-job email(s)")
    return {"classified": classified, "hidden": hidden}




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
    
