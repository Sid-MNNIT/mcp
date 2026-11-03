from datetime import datetime, timedelta
from googleapiclient.errors import HttpError
from utils.email_utils import extract_body, extract_headers
from services.job_email_filter import BLOCKED_DOMAINS

# Gmail files bulk mail into these tabs for us. We skip them completely.
# ("updates" is NOT here on purpose: recruitment systems often land there.)
EXCLUDED_CATEGORIES = ["promotions", "social", "forums"]


def fetch_recent_messages(service, lookback_days=14, max_results=15):
    """
    Cheap first call — asks Gmail for the message IDs matching the query.
    No bodies are downloaded here; each entry is just {id, threadId}.

    Uses a broad job-keyword query so Gmail returns only likely-relevant
    messages, letting a small max_results cover users with dense inboxes.
    """

    after_date = (datetime.utcnow() - timedelta(days=lookback_days)).strftime("%Y/%m/%d")

    # Gmail's search: fold job-related keywords into the query so we don't
    # burn our 15-message budget on marketing / newsletters. Anything not
    # matching still gets caught on the next tick if it has the right
    # keyword — and the LLM does final filtering downstream.
    job_signal = (
        "(interview OR internship OR offer OR hiring OR recruit OR "
        "placement OR shortlisted OR \"application received\" OR "
        "\"we regret\" OR opportunity OR careers OR \"pre-placement\" OR "
        "\"campus\" OR \"drive\" OR \"assessment\" OR CPI)"
    )

    # Keep junk out of the 15 slots: skip Gmail's bulk tabs and blocked senders.
    skip_categories = " ".join(f"-category:{c}" for c in EXCLUDED_CATEGORIES)
    skip_senders = f"-from:({' OR '.join(BLOCKED_DOMAINS)})"

    query = f"(in:inbox OR in:sent) after:{after_date} {job_signal} {skip_categories} {skip_senders}"

    response = service.users().messages().list(
        userId="me",
        q=query,
        maxResults=max_results,
    ).execute()

    return response.get("messages", [])


def _is_wanted_label_set(label_ids):
    """Inbox or sent mail only, and not in one of the bulk tabs."""
    in_mailbox = "INBOX" in label_ids or "SENT" in label_ids
    in_bulk_tab = any(f"CATEGORY_{c.upper()}" in label_ids for c in EXCLUDED_CATEGORIES)
    return in_mailbox and not in_bulk_tab


def fetch_new_message_refs(service, start_history_id, max_results=100):
    """
    Incremental sync. Asks Gmail only for the messages ADDED since
    start_history_id, so old mail is never listed (or judged) a second time.

    Returns {"expired": True} when Gmail no longer keeps history that far
    back (it answers 404). The caller then falls back to the normal search.
    If more than max_results are new, only the newest ones are returned.
    """
    refs = {}  # a dict keeps order and removes duplicates
    latest_history_id = str(start_history_id)
    page_token = None

    try:
        while True:
            response = service.users().history().list(
                userId="me",
                startHistoryId=start_history_id,
                historyTypes=["messageAdded"],
                pageToken=page_token,
                maxResults=500,
            ).execute()

            latest_history_id = str(response.get("historyId", latest_history_id))

            for record in response.get("history", []):
                for added in record.get("messagesAdded", []):
                    message = added["message"]
                    if _is_wanted_label_set(message.get("labelIds", [])):
                        refs[message["id"]] = {"id": message["id"], "threadId": message.get("threadId")}

            page_token = response.get("nextPageToken")
            if not page_token:
                break
    except HttpError as error:
        if error.resp.status == 404:
            return {"expired": True}
        raise

    return {
        "expired": False,
        "historyId": latest_history_id,
        "message_refs": list(refs.values())[-max_results:],
    }


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


def parse_metadata(message):
    """
    Parse a "metadata" format Gmail message (headers only, no body).
    Used for the cheap first check before we decide to download the body.
    """
    headers = {
        h["name"].lower(): h["value"]
        for h in message.get("payload", {}).get("headers", [])
    }

    is_bulk = (
        "list-unsubscribe" in headers
        or headers.get("precedence", "").lower() in ("bulk", "list", "junk")
    )

    return {
        "id": message.get("id"),
        "from": headers.get("from"),
        "subject": headers.get("subject"),
        "isBulk": is_bulk,
    }


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
