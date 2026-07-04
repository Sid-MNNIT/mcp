from mcp.server.fastmcp import FastMCP
import base64
import sys
from email.message import EmailMessage

from gmail_context import get_gmail_service
from services.gmail_service import (
    fetch_recent_messages,
    get_full_message,
    parse_email,
    batch_get_messages,
)
from services.job_email_filter import is_job_related


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
# READ: batch-fetch + filter by IDs (phase 2 of two-phase sync)
# ---------------------------
@mcp.tool()
def fetch_emails_by_ids(userId: str, message_ids: list):
    """
    Second-phase call: downloads the given message IDs in ONE batched
    HTTP request (replacing N sequential round-trips) and returns only
    the ones that pass the job-related filter.
    """
    if not message_ids:
        return {"emails": []}

    service = get_gmail_service(userId)

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
