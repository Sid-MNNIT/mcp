from mcp.server.fastmcp import FastMCP
import base64
import sys
from email.message import EmailMessage

from gmail_context import get_gmail_service
from services.gmail_service import (
    fetch_recent_messages,
    fetch_new_message_refs,
    get_full_message,
    parse_email,
    parse_metadata,
    batch_get_messages,
)
from services.job_email_filter import is_job_related, passes_header_check, rule_based_type


def _log(msg: str) -> None:
    """
    Write a diagnostic line to STDERR.

    Never use plain print() inside an MCP stdio tool:
      1. stdout is the JSON-RPC channel — extra bytes corrupt the protocol.
      2. On Windows the default console codec is cp1252, so any non-ASCII
         character (including emoji) raises UnicodeEncodeError.
    stderr avoids both problems; ASCII-only keeps it safe on any locale.
    """
    try:
        sys.stderr.write(msg + "\n")
        sys.stderr.flush()
    except Exception:
        # Logging must never take down a tool.
        pass

mcp = FastMCP("gmail-mcp")


# ---------------------------
# READ: list only IDs (phase 1 of two-phase sync)
# ---------------------------
@mcp.tool()
def list_recent_message_ids(
    userId: str,
    lookback_days: int = 7,
    max_results: int = 15,
):
    # NOTE: dropped default from 30 → 15 so each sync stays under the
    # 60s httpx timeout on Render free tier. Users with heavy inboxes
    # were timing out during the batched Groq classification step.
    # Increase this once we move off free tier.
    """
    Cheap first-phase call for the sync pipeline: returns Gmail message
    references without downloading bodies. The orchestrator uses these IDs
    to dedupe against the local DB, so full-body downloads only happen for
    messages we haven't already stored.
    """
    service = get_gmail_service(userId)
    refs = fetch_recent_messages(
        service,
        lookback_days=lookback_days,
        max_results=max_results,
    )
    return {"message_refs": refs}


# ---------------------------
# READ: only the messages added since the last sync (incremental sync)
# ---------------------------
@mcp.tool()
def list_new_message_ids(userId: str, start_history_id: str):
    """
    Returns the Gmail message IDs added since start_history_id, plus the new
    historyId to remember. If Gmail has dropped that old history it returns
    expired=True and the caller should use list_recent_message_ids instead.
    """
    service = get_gmail_service(userId)
    return {"sync": fetch_new_message_refs(service, start_history_id)}


# ---------------------------
# READ: current mailbox historyId (used to skip syncs when nothing changed)
# ---------------------------
@mcp.tool()
def get_history_id(userId: str):
    """
    Returns the mailbox's current Gmail historyId. This number goes up every
    time the mailbox changes, so if it is the same as at the last sync there
    is nothing new to fetch. One tiny API call, no message bodies.
    """
    service = get_gmail_service(userId)
    profile = service.users().getProfile(userId="me").execute()
    return {"historyId": str(profile.get("historyId"))}


# ---------------------------
# READ: batch-fetch + filter by IDs (phase 2 of two-phase sync)
# ---------------------------
@mcp.tool()
def fetch_emails_by_ids(userId: str, message_ids: list):
    """
    Second-phase call, in two steps (both batched, one HTTP request each):
      1. download only the headers and drop obvious noise (newsletters,
         blocked senders, bulk mail) without ever fetching its body
      2. download the full body of the rest and apply the keyword filter

    Emails that a recruitment system sent with very clear wording also get
    a "ruleType" (e.g. "INTERVIEW"), so the orchestrator can skip the LLM.
    """
    if not message_ids:
        return {"emails": []}

    service = get_gmail_service(userId)

    # Step 1: headers only
    meta_responses, _ = batch_get_messages(
        service,
        message_ids,
        format_type="metadata",
        metadata_headers=["From", "Subject", "List-Unsubscribe", "Precedence"],
    )
    wanted_ids = []
    for msg_id in message_ids:
        meta = meta_responses.get(msg_id)
        # If the header fetch failed we still try the full fetch below.
        if meta is None or passes_header_check(parse_metadata(meta)):
            wanted_ids.append(msg_id)

    _log(f"[gmail_mcp] header check kept {len(wanted_ids)}/{len(message_ids)} message(s)")
    message_ids = wanted_ids
    if not message_ids:
        return {"emails": []}

    # Step 2: full bodies for the survivors
    responses, errors = batch_get_messages(
        service, message_ids, format_type="full"
    )

    if errors:
        # Log but don't fail — a single bad message shouldn't sink the batch.
        _log(f"[gmail_mcp] batch fetch errors for {len(errors)} message(s)")

    emails = []
    for msg_id in message_ids:
        msg = responses.get(msg_id)
        if not msg:
            continue
        parsed = parse_email(msg)
        if is_job_related(parsed):
            parsed["ruleType"] = rule_based_type(parsed)
            emails.append(parsed)

    return {"emails": emails}


# ---------------------------
# READ: recent job emails (legacy one-shot tool)
# ---------------------------
@mcp.tool()
def get_recent_job_emails(
    userId: str,
    lookback_days: int = 7,
    max_results: int = 30,
):
    """
    Legacy one-shot sync tool. Kept for backward compatibility with callers
    that haven't migrated to the two-phase (list → dedupe → fetch) pattern.

    Internally now uses batched fetch, so it's fast — but it does NOT dedupe
    against the local DB, so the orchestrator's new pipeline is still cheaper.
    """
    service = get_gmail_service(userId)

    refs = fetch_recent_messages(
        service,
        lookback_days=lookback_days,
        max_results=max_results,
    )
    ids = [r["id"] for r in refs if r.get("id")]
    if not ids:
        return {"emails": []}

    responses, _ = batch_get_messages(service, ids, format_type="full")

    emails = []
    for msg_id in ids:
        msg = responses.get(msg_id)
        if not msg:
            continue
        parsed = parse_email(msg)
        if is_job_related(parsed):
            emails.append(parsed)

    return {"emails": emails}


# ---------------------------
# READ: email by id
# ---------------------------
@mcp.tool()
def get_email_by_id(userId: str, message_id: str):
    service = get_gmail_service(userId)

    message = service.users().messages().get(
        userId="me",
        id=message_id,
        format="full"
    ).execute()

    parsed = parse_email(message)
    return {"email": parsed}


# ---------------------------
# READ-ONLY: draft reply
# ---------------------------
@mcp.tool()
def draft_reply(
    userId: str,
    message_id: str,
    tone: str = "professional"
):
    service = get_gmail_service(userId)

    message = service.users().messages().get(
        userId="me",
        id=message_id,
        format="full"
    ).execute()

    parsed = parse_email(message)

    return {
        "reply_context": {
            "to": parsed["from"],
            "subject": f"Re: {parsed['subject']}",
            "threadId": message["threadId"],
            "messageId": message_id,
            "originalEmail": {
                "from": parsed["from"],
                "subject": parsed["subject"],
                "date": parsed["date"],
                "body": parsed["body"]
            },
            "guidelines": {
                "tone": tone,
                "length": "short",
                "style": "clear and polite"
            }
        }
    }


# ---------------------------
# WRITE: send email
# ---------------------------
@mcp.tool()
def send_email(
    userId: str,
    to: str,
    subject: str,
    body: str,
    threadId: str,
    in_reply_to: str
):
    service = get_gmail_service(userId)

    msg = EmailMessage()
    msg["To"] = to
    msg["Subject"] = subject
    msg["In-Reply-To"] = in_reply_to
    msg["References"] = in_reply_to
    msg.set_content(body)

    raw = base64.urlsafe_b64encode(msg.as_bytes()).decode()

    sent = service.users().messages().send(
        userId="me",
        body={
            "raw": raw,
            "threadId": threadId
        }
    ).execute()

    return {
        "status": "sent",
        "messageId": sent["id"],
        "threadId": sent["threadId"]
    }


@mcp.tool()
def ping():
    return "pong"


if __name__ == "__main__":
    mcp.run(transport="stdio")
