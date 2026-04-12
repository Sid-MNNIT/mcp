"""
Pipeline Registry
=================

Authoritative list of all user-facing pipelines that the planner
is allowed to select and the executor is allowed to execute.

Rules:
- Planner MAY read this
- Executor MUST validate against this
- Pipelines MUST match real FastAPI endpoints
- NO MCP tools here
"""

from typing import Dict, Any

PIPELINE_REGISTRY: Dict[str, Dict[str, Any]] = {

    # =========================================================
    # JOB PIPELINES
    # =========================================================

    "job_search": {
        "endpoint": "/pipelines/job-search",
        "type": "ACTION",
        "risk": "LOW",
        "description": "Search for jobs using keywords, location, and filters",
        "required_args": ["keywords"],
        "optional_args": [
            "location",
            "country",
            "maxResults",
            "page",
            "useResumeMatching",
        ],
        "requires_confirmation": False,
    },

    "job_recommendations": {
        "endpoint": "/pipelines/job-recommendations",
        "type": "ACTION",
        "risk": "LOW",
        "description": "Get personalized job recommendations for the user",
        "required_args": [],
        "optional_args": ["maxResults"],
        "requires_confirmation": False,
    },

    "job_categories": {
        "endpoint": "/pipelines/job-categories",
        "type": "ACTION",
        "risk": "LOW",
        "description": "Fetch available job categories",
        "required_args": [],
        "optional_args": ["country"],
        "requires_confirmation": False,
    },

    # =========================================================
    # EMAIL PIPELINES
    # =========================================================

    "email_reply_preview": {
        "endpoint": "/pipelines/email-reply-preview",
        "type": "ACTION",
        "risk": "LOW",
        "description": "Generate a draft reply for an email (preview only)",
        "required_args": ["messageId"],
        "optional_args": ["tone"],
        "requires_confirmation": False,
    },

    "email_reply_send": {
        "endpoint": "/pipelines/email-reply-send",
        "type": "ACTION",
        "risk": "HIGH",
        "description": "Send an email reply after explicit user approval",
        "required_args": ["draft"],
        "optional_args": [],
        "requires_confirmation": True,
    },

    "email_sync": {
        "endpoint": "/pipelines/email-sync",
        "type": "BACKGROUND",
        "risk": "LOW",
        "description": "Sync and store recent job-related emails",
        "required_args": [],
        "optional_args": [],
        "requires_confirmation": False,
    },
    "email_query": {
        "endpoint": "/pipelines/email-query",
        "type": "ACTION",
        "risk": "LOW",
        "description": (
            "Query and fetch emails from the database with optional filters. "
            "Use this when the user wants to see, summarise, or analyse their stored emails. "
            "Supports filtering by sender (e.g. 'amazon', 'google'), "
            "email type (JOB/INTERVIEW/OFFER/REJECTION/OTHER), "
            "folder (INBOX/SENT), or a keyword in subject/body."
        ),
        "required_args": [],
        "optional_args": ["sender", "type", "folder", "keyword", "limit"],
        "requires_confirmation": False,
    },

    "email_digest": {
        "endpoint": "/pipelines/email-digest",
        "type": "ACTION",
        "risk": "LOW",
        "description": (
            "Generate a digest/summary of the user's emails grouped by type "
            "(JOB, INTERVIEW, OFFER, REJECTION, OTHER) for a given time period. "
            "Use this when the user asks for a briefing, summary, or overview of their emails. "
            "period can be: 'today' (last 24h), 'week' (last 7 days), "
            "'month' (last 30 days), or 'all' (everything). "
            "Examples: 'morning briefing', 'what happened this week', "
            "'how many rejections this month', 'summarise all my emails'."
        ),
        "required_args": [],
        "optional_args": ["period"],
        "requires_confirmation": False,
    },


    # =========================================================
    # APPLICATION TRACKER PIPELINES
    # =========================================================

    "application_stats": {
        "endpoint": "/pipelines/application-stats",
        "type": "ACTION",
        "risk": "LOW",
        "description": (
            "Track and summarise job application status across all companies. "
            "Infers application status (APPLIED, INTERVIEW, OFFER, REJECTION) from email types. "
            "Use when user asks: 'how is my job search going', 'how many interviews do I have', "
            "'how many offers', 'what is my application status', 'track my applications', "
            "'how many rejections this month'. "
            "period can be: 'today', 'week', 'month', 'all'."
        ),
        "required_args": [],
        "optional_args": ["period"],
        "requires_confirmation": False,
    },

    "application_followup": {
        "endpoint": "/pipelines/application-followup",
        "type": "ACTION",
        "risk": "LOW",
        "description": (
            "Find companies that haven't replied in N days and may need a follow-up. "
            "Use when user asks: 'which companies haven't replied', 'who should I follow up with', "
            "'any pending applications', 'companies with no response', "
            "'who hasn't got back to me'. "
            "days defaults to 7 if not specified."
        ),
        "required_args": [],
        "optional_args": ["days"],
        "requires_confirmation": False,
    },

    # =========================================================
    # CALENDAR PIPELINES
    # =========================================================

    "calendar_create_event": {
        "endpoint": "/pipelines/calendar-create-event",
        "type": "ACTION",
        "risk": "HIGH",
        "description": "Create a calendar event (interview, assessment, etc.)",
        "required_args": [
            "eventType",
            "company",
            "date",
            "startTime",
            "endTime",
        ],
        "optional_args": [
            "role",
            "timezone",
            "meetLink",
            "description",
        ],
        "requires_confirmation": True,
    },

    "extract_calendar_from_email": {
        "endpoint": "/pipelines/extract-calendar-from-email",
        "type": "ACTION",
        "risk": "LOW",
        "description": "Extract calendar event details from email content",
        "required_args": ["subject", "text"],
        "optional_args": [],
        "requires_confirmation": False,
    },

    "interview_prep": {
        "endpoint": "/pipelines/interview-prep",
        "type": "ACTION",
        "risk": "LOW",
        "description": (
            "Give personalized interview preparation advice by reading the user's resume "
            "and the interview email from a specific company. Cross-references the user's "
            "skills and experience against what the email mentions, and gives actionable advice. "
            "Use when user asks: 'what should I study for X interview', "
            "'how should I prepare for X', 'what should I add to my resume for X', "
            "'what topics should I cover for X interview', 'tips for X interview', "
            "'help me prepare for X'. Always extract the company name into args.company."
        ),
        "required_args": ["company"],
        "optional_args": [],
        "requires_confirmation": False,
    },

    "calendar_events": {
        "endpoint": "/pipelines/calendar-events",
        "type": "ACTION",
        "risk": "LOW",
        "description": (
            "Fetch the user's upcoming calendar events (interviews, assessments, meetings). "
            "Use when user asks: 'what are my upcoming interviews', 'show my schedule', "
            "'any interviews this week', 'what do I have coming up', "
            "'when is my next interview', 'show my calendar events'. "
            "days defaults to 30 (next 30 days) if not specified."
        ),
        "required_args": [],
        "optional_args": ["days"],
        "requires_confirmation": False,
    },
}
