import copy
from datetime import datetime

from langchain_core.tools import StructuredTool, tool
from langchain_openai import ChatOpenAI
from langgraph.prebuilt import create_react_agent

from client.mcp.client import get_mcp_client
from client.llm.openai_client import get_openai_model
from client.ask_jobsy.executor import run_pipeline
from client.ask_jobsy.profile_fetcher import fetch_user_profile
from client.backend_client.email_query_api import query_emails_from_db
from client.backend_client.email_digest_api import fetch_emails_for_digest
from client.backend_client.calendar_api import get_upcoming_calendar_events
from client.backend_client.application_tracker_api import get_application_stats, get_followup_needed
from client.orchestrator.email_agent import prepare_email_reply_preview
from client.orchestrator.job_agent import get_personalized_recommendations_hybrid

# MCP tools the agent must not see: ping is just a health check, the sync tools
# are for the background email pipeline, and send_email has no approval step yet.
EXCLUDED_MCP_TOOLS = {
    "ping",
    "send_email",
    "list_recent_message_ids",
    "fetch_emails_by_ids",
    "get_recent_job_emails",
}

SYSTEM_PROMPT = """You are Jobsy AI, a friendly and precise job search assistant.
Today is {today}.

{profile}

Use your tools to get the user's real data, never guess it.
- "show me / what did X send / read my X email" -> search_emails with sender set to the company name.
- Summaries, briefings, "what happened this week" -> email_digest.
- Interviews, schedule, "when is my next interview" -> calendar_events, not search_emails.
- "How is my job search going", offers, rejections -> application_stats.
- "Who hasn't replied" -> application_followup.
- To reply to an email, find it with search_emails and then use draft_email_reply. You can only draft replies, you cannot send them.
- Career advice and general questions need no tools, just answer.

Rules:
- Only say what the tool results contain. Use the exact names, subjects, dates and counts. Never invent anything.
- If a count is 0, leave that category out.
- Be concise and warm, under 250 words, with markdown. Never show raw JSON or ids like _id or emailId.
- If the data has a meeting link, show it as a link."""


def _profile_text(profile: dict) -> str:
    if not profile:
        return "You don't have the user's profile yet."

    lines = []
    if profile.get("fullname"):         lines.append(f"Name: {profile['fullname']}")
    if profile.get("headline"):         lines.append(f"Headline: {profile['headline']}")
    if profile.get("current_role"):     lines.append(f"Current role: {profile['current_role']} at {profile.get('current_company', '')}")
    if profile.get("latest_degree"):    lines.append(f"Education: {profile['latest_degree']}, {profile.get('latest_institution', '')}")
    if profile.get("skills"):           lines.append(f"Skills: {', '.join(profile['skills'])}")
    if profile.get("location_string"):  lines.append(f"Location: {profile['location_string']}")
    if profile.get("open_to_work"):     lines.append("Status: open to work")

    return "About the user:\n" + "\n".join(lines) if lines else "You don't have the user's profile yet."


def _bind_user(tool, user_id: str) -> StructuredTool:
    """
    Gmail tools need a userId. Hide it from the LLM and fill it in ourselves,
    so the model can never ask for another user's inbox.
    """
    schema = copy.deepcopy(tool.args_schema)
    takes_user = "userId" in schema.get("properties", {})

    if takes_user:
        schema["properties"].pop("userId")
        schema["required"] = [r for r in schema.get("required", []) if r != "userId"]

    async def run(**kwargs):
        if takes_user:
            kwargs["userId"] = user_id
        return await tool.ainvoke(kwargs)

    return StructuredTool(
        name=tool.name,
        description=tool.description,
        args_schema=schema,
        coroutine=run,
    )


def pipeline_tools(jwt: str, user_id: str) -> list:
    """The old pipelines as tools. They need the user's JWT, so they are built per request."""

    @tool
    async def search_emails(sender: str = "", type: str = "", folder: str = "", keyword: str = "", limit: int = 10) -> dict:
        """Search the user's stored emails. sender is a company or person (e.g. 'amazon'),
        type is JOB, INTERVIEW, OFFER, REJECTION or OTHER, folder is INBOX or SENT,
        keyword is searched in the subject and body. emailId is what draft_email_reply needs."""
        result = await query_emails_from_db(
            jwt=jwt, sender=sender or None, type=type or None,
            folder=folder or None, keyword=keyword or None, limit=limit,
        )
        # Test emails sent from the user's own Gmail have no company in "from", so try the subject/body
        if sender and not result.get("emails"):
            result = await query_emails_from_db(jwt=jwt, keyword=sender, type=type or None, folder=folder or None, limit=limit)

        for email in result.get("emails", []):
            email["text"] = (email.get("text") or "")[:500]
        return result

    @tool
    async def email_digest(period: str = "week") -> dict:
        """Summary of the user's emails grouped by type (JOB, INTERVIEW, OFFER, REJECTION, OTHER).
        period is today, week, month or all."""
        return await fetch_emails_for_digest(jwt=jwt, period=period)

    @tool
    async def application_stats(period: str = "all") -> dict:
        """Status of the user's job applications (applied, interview, offer, rejection), inferred
        from their emails. period is today, week, month or all."""
        return await get_application_stats(jwt=jwt, period=period)

    @tool
    async def application_followup(days: int = 7) -> dict:
        """Companies that haven't replied in the last N days and may need a follow-up."""
        return await get_followup_needed(jwt=jwt, days=days)

    @tool
    async def calendar_events(days: int = 30) -> dict:
        """The user's upcoming calendar events (interviews, assessments, meetings) for the next N days."""
        events = await get_upcoming_calendar_events(jwt=jwt, days=days)
        return {"count": len(events), "events": events}

    @tool
    async def job_recommendations(max_results: int = 20) -> dict:
        """Personalized job recommendations based on the user's profile and resume."""
        return await get_personalized_recommendations_hybrid(user_id=user_id, jwt=jwt, max_results=max_results)

    @tool
    async def interview_prep(company: str) -> dict:
        """Interview preparation advice for a company. It reads the user's resume and the interview
        email from that company, and returns advice based on both."""
        # this one only exists as an orchestrator endpoint, so call it like the executor does
        return await run_pipeline(
            pipeline_name="interview_prep",
            endpoint="/pipelines/interview-prep",
            args={"company": company},
            jwt=jwt,
        )

    @tool
    async def draft_email_reply(message_id: str, tone: str = "professional") -> dict:
        """Write a draft reply to an email. message_id is the emailId from search_emails.
        This only drafts, it does not send anything."""
        return await prepare_email_reply_preview(message_id=message_id, tone=tone, jwt=jwt)

    return [
        search_emails, email_digest, application_stats, application_followup,
        calendar_events, job_recommendations, interview_prep, draft_email_reply,
    ]


async def run_react_agent(user_message: str, user_id: str, jwt: str, history: list = None):
    mcp = await get_mcp_client()
    mcp_tools = await mcp.get_tools()

    tools = [_bind_user(t, user_id) for t in mcp_tools if t.name not in EXCLUDED_MCP_TOOLS]
    tools += pipeline_tools(jwt, user_id)
    print(f"🤖 [react_agent] tools: {[t.name for t in tools]}")

    profile = await fetch_user_profile(jwt)
    prompt = SYSTEM_PROMPT.format(
        today=datetime.now().strftime("%A, %d %B %Y"),
        profile=_profile_text(profile),
    )

    # create_react_agent calls llm.bind_tools(tools) for us
    llm = ChatOpenAI(model=get_openai_model(), temperature=0.1)
    agent = create_react_agent(llm, tools, prompt=prompt)

    messages = [(m["role"], m["content"]) for m in (history or [])]
    messages.append(("user", user_message))

    result = await agent.ainvoke({"messages": messages}, {"recursion_limit": 12})

    tools_used = [
        call["name"]
        for m in result["messages"]
        for call in getattr(m, "tool_calls", [])
    ]
    return result["messages"][-1].content, tools_used
