from datetime import datetime, timedelta
from utils.email_utils import extract_body, extract_headers


def fetch_recent_messages(service, lookback_days=7, max_results=50):
    """
    Cheap first call — asks Gmail for the message IDs matching the query.
    No bodies are downloaded here; each entry is just {id, threadId}.
    """

    after_date = (datetime.utcnow() - timedelta(days=lookback_days)).strftime("%Y/%m/%d")

    query = f"(in:inbox OR in:sent) after:{after_date}"

    response = service.users().messages().list(
        userId="me",
        q=query,
        maxResults=max_results,
    ).execute()

    return response.get("messages", [])


def get_full_message(service, message_id):
    """Kept for callers that still need a single-message fetch."""
    return service.users().messages().get(
        userId="me",
        id=message_id,
        format="full",
    ).execute()


# ─────────────────────────────────────────────────────────────────────────────
# BATCHED FETCH
#
# Gmail supports up to 100 sub-requests per batch HTTP call, so 30 sequential
# messages.get() round-trips collapse into a single HTTP request. This is the
# single biggest speedup in the sync pipeline.
# ─────────────────────────────────────────────────────────────────────────────
def batch_get_messages(service, message_ids, format_type="full", metadata_headers=None):
    """
    Fetch many Gmail messages in one HTTP call.

    Returns (responses_by_id, errors_by_id). Errors are returned rather than
    raised so a single bad message doesn't kill the whole batch.
    """
    if not message_ids:
        return {}, {}

    responses = {}
    errors = {}

    def _callback(request_id, response, exception):
        if exception is not None:
            errors[request_id] = exception
        else:
            responses[request_id] = response

    # Chunk defensively: Gmail's per-batch cap is 100 sub-requests.
    for chunk_start in range(0, len(message_ids), 100):
        chunk = message_ids[chunk_start:chunk_start + 100]
        batch = service.new_batch_http_request(callback=_callback)

        for msg_id in chunk:
            kwargs = {"userId": "me", "id": msg_id, "format": format_type}
            if format_type == "metadata" and metadata_headers:
                kwargs["metadataHeaders"] = metadata_headers

            req = service.users().messages().get(**kwargs)
            batch.add(req, request_id=msg_id)

        batch.execute()

    return responses, errors


def parse_email(message):
    """Parse a full-format Gmail message into the shape the orchestrator expects."""
    payload = message.get("payload", {})
    headers = extract_headers(payload.get("headers", []))
    body = extract_body(payload)

    labels = message.get("labelIds", [])

    is_sent = "SENT" in labels
    is_inbox = "INBOX" in labels

    return {
        "id": message.get("id"),
        "threadId": message.get("threadId"),
        "from": headers.get("from"),
        "to": headers.get("to"),
        "subject": headers.get("subject"),
        "date": headers.get("date"),
        "timestamp": int(message.get("internalDate", 0)),
        "labels": labels,
        "isSent": is_sent,
        "isInbox": is_inbox,
        "body": body.strip(),
    }
