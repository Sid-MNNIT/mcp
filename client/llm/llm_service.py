import json

from client.llm.groq_client import get_groq_client, groq_chat_with_fallback


MODEL_ID = "llama-3.1-8b-instant"


def generate_email_reply(prompt: str) -> str:
    """
    Generates a polite, professional email reply.
    Returns ONLY the email body.
    """

    response = groq_chat_with_fallback(
        model=MODEL_ID,
        messages=[
            {
                "role": "system",
                "content": (
                    "You are a professional assistant that writes concise, "
                    "polite, business-appropriate email replies."
                )
            },
            {
                "role": "user",
                "content": prompt
            }
        ],
        temperature=0.4,
        max_tokens=300,
    )

    return response.choices[0].message.content.strip()


ALLOWED_EMAIL_TYPES = {"OFFER", "INTERVIEW", "REJECTION", "JOB", "OTHER"}

# Body snippet cap for classification prompts. The first ~800 chars of the
# body already carry the classification signal — anything more just wastes
# tokens and slows Groq down.
_BODY_SNIPPET_CAP = 800
_SUBJECT_SNIPPET_CAP = 200


def _snippet(text, cap):
    if not text:
        return ""
    return text[:cap]


def classify_email_semantic(subject: str, body: str) -> dict:
    """
    Determines whether an email is job-related and classifies it.
    Single-email helper — for bulk pipelines prefer classify_emails_batch()
    which classifies up to `batch_size` emails per Groq call.
    """

    prompt = f"""
You classify emails related to job applications.

Decide:
1. Is this a REAL job-related email?
2. If yes, classify into ONE category:
   OFFER, INTERVIEW, REJECTION, JOB, OTHER

Return STRICT JSON only (no markdown, no explanation):
{{
  "is_relevant": true | false,
  "type": "OFFER | INTERVIEW | REJECTION | JOB | OTHER"
}}

Subject:
{_snippet(subject, _SUBJECT_SNIPPET_CAP)}

Body:
{_snippet(body, _BODY_SNIPPET_CAP)}
""".strip()

    response = groq_chat_with_fallback(
        model=MODEL_ID,
        messages=[{"role": "user", "content": prompt}],
        temperature=0,
        max_tokens=120,
    )

    raw_text = response.choices[0].message.content.strip()

    # 🔍 DEBUG LOG
    print("\n[LLM RAW RESPONSE]")
    print(raw_text)

    # 🔧 Strip markdown if present
    cleaned = raw_text
    if raw_text.startswith("```"):
        cleaned = raw_text.strip("`").replace("json", "").strip()

    try:
        result = json.loads(cleaned)
    except Exception as e:
        print("[LLM PARSE ERROR]", e)
        return {"is_relevant": False, "type": "OTHER"}

    # 🔍 DEBUG LOG
    print("[LLM PARSED RESULT]", result)

    return {
        "is_relevant": bool(result.get("is_relevant", False)),
        "type": result.get("type", "OTHER").upper(),
    }


def classify_emails_batch(emails: list, batch_size: int = 10) -> list:
    """
    Batch-classify a list of emails in as few Groq calls as possible.

    Cuts LLM latency from O(n) sequential calls to O(n / batch_size)
    — for 20 new emails this is 2 Groq calls instead of 20.

    Each returned item is:
        {"is_relevant": bool, "type": "OFFER|INTERVIEW|REJECTION|JOB|OTHER"}

    Results preserve input order.
    """
    if not emails:
        return []

    results = []
    for chunk_start in range(0, len(emails), batch_size):
        chunk = emails[chunk_start:chunk_start + batch_size]
        results.extend(_classify_chunk(chunk))
    return results


def _classify_chunk(chunk: list) -> list:
    """Classify one chunk of <= batch_size emails in a single Groq call."""

    numbered = "\n\n".join(
        f"--- Email {i + 1} ---\n"
        f"Subject: {_snippet(e.get('subject'), _SUBJECT_SNIPPET_CAP)}\n"
        f"Body: {_snippet(e.get('body'), _BODY_SNIPPET_CAP)}"
        for i, e in enumerate(chunk)
    )

    prompt = f"""
You classify emails related to a specific job seeker's job applications.

A REAL job email is a DIRECT 1:1 communication about THIS person's
application, interview, offer, or rejection. Examples:
- "We'd like to invite you for an interview for the SDE role"
- "Thank you for applying — we regret to inform..."
- "We're pleased to extend an offer of employment"
- A recruiter reaching out about a specific position

The following are NOT real job emails — mark them is_relevant: false:
- Newsletters, weekly digests, blog posts, Substack / Medium articles
- LeetCode / HackerRank / GeeksforGeeks practice or contest emails
- Google / GitHub security alerts, sign-in notifications, verification codes
- Marketing, promotional, or "welcome to" onboarding emails
- Generic career-tip content that isn't about a specific application
- Job board digests ("5 new jobs matching your search")

For EACH numbered email below, decide:
1. Is it a REAL job-related email (as defined above)?
2. If yes, classify into ONE category: OFFER, INTERVIEW, REJECTION, JOB, OTHER
   - OFFER      = offer letter / offer extended
   - INTERVIEW  = interview invitation, scheduling, or reminder
   - REJECTION  = "we regret", "not selected", "moving forward with others"
   - JOB        = recruiter outreach / application confirmation
   - OTHER      = job-related but doesn't fit above

Return STRICT JSON only — an array in the SAME order as the input, one
object per email, no markdown, no explanation:
[
  {{"is_relevant": true, "type": "INTERVIEW"}},
  {{"is_relevant": false, "type": "OTHER"}}
]

The array MUST have exactly {len(chunk)} objects.

Emails:
{numbered}
""".strip()

    response = groq_chat_with_fallback(
        model=MODEL_ID,
        messages=[{"role": "user", "content": prompt}],
        temperature=0,
        # ~40 tokens per classification + a little slack for JSON overhead
        max_tokens=40 * len(chunk) + 60,
    )

    raw_text = response.choices[0].message.content.strip()

    print("\n[LLM BATCH RAW RESPONSE]")
    print(raw_text[:400])

    cleaned = raw_text
    if raw_text.startswith("```"):
        cleaned = raw_text.strip("`").replace("json", "", 1).strip()

    fallback = [{"is_relevant": True, "type": "OTHER"} for _ in chunk]

    try:
        arr = json.loads(cleaned)
    except Exception as e:
        print("[LLM BATCH PARSE ERROR]", e)
        return fallback

    if not isinstance(arr, list) or len(arr) != len(chunk):
        print(f"[LLM BATCH SHAPE ERROR] expected list of {len(chunk)}, got: {arr}")
        return fallback

    normalized = []
    for item in arr:
        if not isinstance(item, dict):
            normalized.append({"is_relevant": True, "type": "OTHER"})
            continue
        t = (item.get("type") or "OTHER").upper()
        if t not in ALLOWED_EMAIL_TYPES:
            t = "OTHER"
        normalized.append({
            "is_relevant": bool(item.get("is_relevant", False)),
            "type": t,
        })
    return normalized


def classify_request_requirements(
    user_message: str,
    conversation_context: list | None = None,
) -> dict:
    """
    Classifies whether a request requires:
    - RAG (knowledge lookup)
    - TOOL / ACTION execution

    Returns STRICT JSON-compatible dict.
    """

    prompt = f"""
You are an intent classification system.

Decide:
1. Does the user need knowledge lookup or explanation? (requires_rag)
2. Does the user want an action or tool execution? (requires_tools)

Rules:
- RAG: explanations, definitions, debugging, errors, "why", "how"
- ACTION: run, execute, trigger, start, deploy, schedule

Respond ONLY in valid JSON:
{{
  "requires_rag": true | false,
  "requires_tools": true | false,
  "intent": "KNOWLEDGE" | "ACTION" | "BOTH"
}}

User message:
{user_message}

Conversation context:
{conversation_context}
""".strip()

    response = groq_chat_with_fallback(
        model=MODEL_ID,
        messages=[{"role": "user", "content": prompt}],
        temperature=0,
        max_tokens=120,
    )

    raw_text = response.choices[0].message.content.strip()


    print("\n[LLM RAW RESPONSE]")
    print(raw_text)

    print("\n[CALENDAR EXTRACTION RAW RESPONSE]")
    print(raw_text)

    # Strip markdown if present
    cleaned = raw_text
    if raw_text.startswith("```"):
        cleaned = raw_text.strip("`").replace("json", "").strip()

    try:
        result = json.loads(cleaned)
    except Exception as e:
        print("[LLM PARSE ERROR]", e)
        return {
            "requires_rag": False,
            "requires_tools": False,
            "intent": "KNOWLEDGE",
        }


    print("[LLM PARSED RESULT]", result)

    return {
        "requires_rag": bool(result.get("requires_rag", False)),
        "requires_tools": bool(result.get("requires_tools", False)),
        "intent": result.get("intent", "KNOWLEDGE").upper(),
    }
    

def extract_calendar_details_from_email(subject: str, text: str) -> dict:
    """
    Extracts calendar event details from an interview email.
    Uses LLM to parse unstructured email text into structured calendar data.
    """
    
    prompt = f"""
You are an AI assistant that extracts calendar event details from interview invitation emails.

Extract the following information from the email:
1. Company name
2. Job role/position  
3. Interview date (format: YYYY-MM-DD)
4. Interview start time (format: HH:MM in 24-hour format)
5. Interview end time (format: HH:MM in 24-hour format, estimate 1 hour if not specified)
6. Meeting link (Google Meet, Zoom, Teams, etc.)
7. Timezone (default to "Asia/Kolkata" if not specified)
8. Brief description/summary

Return STRICT JSON only (no markdown, no explanation):
{{
  "company": "Company Name",
  "role": "Job Title",
  "date": "YYYY-MM-DD",
  "startTime": "HH:MM",
  "endTime": "HH:MM",
  "meetLink": "https://...",
  "timezone": "Asia/Kolkata",
  "description": "Brief summary"
}}

If any field cannot be extracted, use these defaults:
- role: "Interview"
- endTime: 1 hour after startTime
- timezone: "Asia/Kolkata"
- description: subject line
- meetLink: "" (empty string if not found)

Email Subject:
{subject}

Email Body:
{text}
""".strip()

    response = groq_chat_with_fallback(
        model=MODEL_ID,
        messages=[{"role": "user", "content": prompt}],
        temperature=0,
        max_tokens=400,
    )

    raw_text = response.choices[0].message.content.strip()

    print("\n[CALENDAR EXTRACTION RAW RESPONSE]")
    print(raw_text)

    # Strip markdown if present
    cleaned = raw_text
    if raw_text.startswith("```"):
        cleaned = raw_text.strip("`").replace("json", "").strip()

    try:
        result = json.loads(cleaned)
    except Exception as e:
        print("[CALENDAR EXTRACTION PARSE ERROR]", e)
        raise ValueError(f"Failed to parse LLM response: {e}")

    print("[CALENDAR EXTRACTION PARSED RESULT]", result)

    # Validate required fields
    required_fields = ["company", "date", "startTime", "endTime"]
    for field in required_fields:
        if not result.get(field):
            raise ValueError(f"Missing required field: {field}")

    # Set defaults for optional fields
    result.setdefault("role", "Interview")
    result.setdefault("timezone", "Asia/Kolkata")
    result.setdefault("description", subject)
    result.setdefault("meetLink", "")

    return result