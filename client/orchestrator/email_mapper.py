from client.llm.llm_service import classify_email_semantic
from datetime import datetime

ALLOWED_TYPES = {
    "JOB", "INTERVIEW", "OFFER", "REJECTION", "OTHER"
}


def _resolve_date(email):
    """Return a datetime for the email, or raise if none is available."""
    timestamp = email.get("timestamp")
    if timestamp:
        return datetime.utcfromtimestamp(timestamp / 1000)

    date = email.get("date")
    if not date:
        raise ValueError(f"Missing date for email {email.get('id')}")
    return date


def _finalize_payload(email, classification):
    """Build the backend payload given an email + a classification result."""
    if not classification.get("is_relevant"):
        return None

    email_type = (classification.get("type") or "OTHER").upper()
    if email_type not in ALLOWED_TYPES:
        email_type = "OTHER"

    date = _resolve_date(email)
    folder = "SENT" if email.get("isSent") else "INBOX"

    payload = {
        "emailId": email["id"],
        "type": email_type,
        "threadId": email["threadId"],
        "from": email.get("from", ""),
        "subject": email.get("subject", ""),
        "text": email.get("body", ""),
        "date": date.isoformat() if hasattr(date, "isoformat") else date,
        "folder": folder,
    }
    return payload


def map_to_backend(email):
    """
    Single-email mapper — classifies via Groq then builds the payload.
    Kept for callers not using the batch pipeline. Prefer
    map_to_backend_with_classification() when you've already batch-classified.
    """
    result = classify_email_semantic(
        email.get("subject", ""),
        email.get("body", ""),
    )
    return _finalize_payload(email, result)


def map_to_backend_with_classification(email, classification):
    """
    Batch-friendly mapper — takes a pre-computed classification result so
    the caller can do one Groq call for many emails and then map them all
    without any further LLM traffic.
    """
    return _finalize_payload(email, classification)
