# client/backend_client/email_api.py
import os
import requests
SERVICE_KEY = os.getenv("SERVICE_KEY", "")

BASE_URL = os.getenv("BACKEND_BASE_URL", "http://localhost:5000")

def get_existing_email_ids(email_ids: list, jwt: str = None, user_id: str = None) -> set:
    """
    Given a list of Gmail message IDs, returns the subset
    that are already stored in MongoDB — so we skip LLM classification
    for emails we've already processed.
    """
    if not email_ids:
        return set()

    headers = {"Content-Type": "application/json"}
    payload = {"emailIds": email_ids}

    if jwt:
        headers["Authorization"] = f"Bearer {jwt}"
    else:
        headers["X-Service-Key"] = SERVICE_KEY
        headers["X-User-Id"] = str(user_id)
        payload["userId"] = str(user_id)

    try:
        res = requests.post(
            f"{BASE_URL}/api/emails/exists",
            json=payload,
            headers=headers,
            timeout=10
        )
        res.raise_for_status()
        return set(res.json().get("existingIds", []))
    except Exception as e:
        print(f"⚠️ [email_api] get_existing_email_ids failed: {e} — skipping pre-filter")
        return set()  # fail open: classify everything if check fails


def get_pending_emails(jwt: str = None, user_id: str = None, limit: int = 30) -> list:
    """
    Emails the sync has saved but not classified yet (type PENDING).
    """
    headers = {"Content-Type": "application/json"}

    if jwt:
        headers["Authorization"] = f"Bearer {jwt}"
    else:
        headers["X-Service-Key"] = SERVICE_KEY
        headers["X-User-Id"] = str(user_id)

    res = requests.post(
        f"{BASE_URL}/api/emails/query",
        json={"type": "PENDING", "limit": limit},
        headers=headers,
        timeout=10
    )
    res.raise_for_status()
    return res.json().get("emails", [])


def save_email(email: dict, jwt: str = None, user_id: str = None):
    
    if not jwt and not user_id:
        raise RuntimeError("Either JWT or user_id is required for save_email")

    headers = {"Content-Type": "application/json"}
    payload = email.copy()

    if jwt:
        # User flow — authenticate with JWT
        headers["Authorization"] = f"Bearer {jwt}"
    else:
        # Cron flow — authenticate with service key + user id
        headers["X-Service-Key"] = SERVICE_KEY
        headers["X-User-Id"] = str(user_id)

    if user_id:
        payload["userId"] = user_id

    res = requests.post(
        f"{BASE_URL}/api/emails",
        json=payload,
        headers=headers,
        timeout=10
    )

    res.raise_for_status()
    return res.json()