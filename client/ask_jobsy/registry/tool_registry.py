"""
Tool Registry
=============

Internal MCP tool registry.
This file maps MCP tools to their usage and risk level.

Rules:
- Planner MUST NOT import this
- Used ONLY by pipeline implementations
- These are NOT user-facing concepts
"""

from typing import Dict, Any

TOOL_REGISTRY: Dict[str, Dict[str, Any]] = {

    # =========================================================
    # EMAIL TOOLS
    # =========================================================

    "draft_reply": {
        "description": "Generate draft reply context from a Gmail message",
        "risk": "LOW",
        "used_by_pipeline": "email_reply_preview",
    },

    "send_email": {
        "description": "Send an email via Gmail",
        "risk": "HIGH",
        "used_by_pipeline": "email_reply_send",
        "requires_confirmation": True,
    },

    "get_recent_job_emails": {
        "description": "Fetch recent job-related emails from Gmail (legacy one-shot)",
        "risk": "LOW",
        "used_by_pipeline": "email_sync",
    },

    "list_recent_message_ids": {
        "description": "Cheap phase-1 sync call: list Gmail message IDs (no bodies)",
        "risk": "LOW",
        "used_by_pipeline": "email_sync",
    },

    "fetch_emails_by_ids": {
        "description": "Batched phase-2 sync call: fetch + filter emails by ID",
        "risk": "LOW",
        "used_by_pipeline": "email_sync",
    },
}
