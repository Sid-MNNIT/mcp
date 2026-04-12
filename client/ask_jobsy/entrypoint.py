from typing import Optional, Dict, Any
import base64
import json as _jwt_json

from client.ask_jobsy.planner import planner_decide
from client.ask_jobsy.executor import run_pipeline
from client.ask_jobsy.validator import validate_plan
from client.ask_jobsy.profile_fetcher import fetch_user_profile
import httpx
import os

NODE_API = os.getenv("NODE_API_URL", "http://localhost:5000")
from client.ask_jobsy.memory import (
    get_conversation_context,
    save_conversation_turn,
)


# -------------------------------------------------
# Helper: resolve messageId from sender keyword
# -------------------------------------------------

async def _resolve_message_id(user_message: str, jwt: str) -> str | None:
    """
    Uses Groq to extract the sender/company keyword from the user message,
    then queries the inbox to find the matching email's Gmail emailId.
    """
    from client.backend_client.email_query_api import query_emails_from_db
    from client.llm.groq_client import get_groq_client
    import asyncio

    # Step 1: Use Groq to extract just the sender/company name
    try:
        groq = get_groq_client()
        extraction = await asyncio.to_thread(
            groq.chat.completions.create,
            model="llama-3.1-8b-instant",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "Extract only the company or sender name from the user's message. "
                        "Return ONLY the name, nothing else. No punctuation, no explanation. "
                        "Examples:\n"
                        "'draft reply for amazon email' -> 'amazon'\n"
                        "'reply to desmus and co' -> 'desmus'\n"
                        "'respond to shona labs interview' -> 'shona labs'\n"
                        "'draft a reply for my desmus and co gmail' -> 'desmus'"
                    )
                },
                {"role": "user", "content": user_message}
            ],
            temperature=0,
            max_tokens=20,
        )
        keyword = extraction.choices[0].message.content.strip().lower()
        print(f"🔵 Groq extracted sender keyword: '{keyword}'")
    except Exception as e:
        print(f"⚠️ Groq keyword extraction failed: {e}, falling back to raw message")
        keyword = user_message

    # Step 2: Query inbox using the clean keyword
    for attempt in [
        {"sender": keyword, "folder": "INBOX", "limit": 5},
        {"keyword": keyword, "folder": "INBOX", "limit": 5},
        {"keyword": keyword, "limit": 10},
    ]:
        try:
            result = await query_emails_from_db(jwt=jwt, **attempt)
            emails = result.get("emails", [])
            if emails:
                email_id = emails[0].get("emailId")
                print(f"🟢 Resolved emailId: '{email_id}' from sender '{emails[0].get('from')}'")
                return email_id
        except Exception:
            continue

    print(f"🔴 Could not resolve messageId for keyword: '{keyword}'")
    return None


# -------------------------------------------------
# Main Entrypoint
# -------------------------------------------------

async def handle_user_message(
    jwt: str,
    user_message: str,
    conversation_id: Optional[str],
    metadata: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Core brain of Ask Jobsy.

    Flow:
    User → Planner → Validator → Executor → Memory
    """

    metadata = metadata or {}

    
    user_id = ""
    try:
        payload_part = jwt.split(".")[1]
        payload_part += "=" * (4 - len(payload_part) % 4)
        decoded = _jwt_json.loads(base64.b64decode(payload_part).decode("utf-8"))
        user_id = str(decoded.get("_id") or decoded.get("id") or decoded.get("sub") or "")
    except Exception:
        pass

    conversation_context = get_conversation_context(conversation_id, user_id)

   
    user_profile = await fetch_user_profile(jwt)
    if user_profile:
        metadata["user_profile"] = user_profile

    plan = await planner_decide(
        user_message=user_message,
        conversation_context=conversation_context,
        metadata=metadata,
    )

   
    if plan["type"] == "CHAT":
        
        from client.llm.openai_client import get_openai_client, get_openai_model
        client = get_openai_client()
        model = get_openai_model()

        context_messages = [
            {"role": t["role"], "content": t["content"]}
            for t in conversation_context
        ]

    
        p = metadata.get("user_profile", {})
        if p:
            name = p.get("fullname", "there")
            first_name = name.split()[0] if name else "there"
            age_str = f", {p['age']} years old" if p.get("age") else ""
            role_str = f" Currently working as {p['current_role']} at {p['current_company']}." if p.get("current_role") else ""
            edu_str = f" Studied {p['latest_degree']} at {p['latest_institution']}." if p.get("latest_degree") else ""
            skills_str = f" Skills: {', '.join(p['skills'][:6])}." if p.get("skills") else ""
            location_str = f" Based in {p['location_string']}." if p.get("location_string") else ""
            otw_str = " They are currently open to work." if p.get("open_to_work") else ""
            about_str = f" About them: {p['about']}." if p.get("about") else ""

            personal_context = (
                f"You are talking to {name}{age_str}.{location_str}{role_str}"
                f"{edu_str}{skills_str}{otw_str}{about_str}\n"
                f"Address them by their first name ({first_name}) naturally when appropriate. "
                f"Use their background to give personalised, relevant advice."
            )
        else:
            personal_context = "You don't have the user's profile yet — be helpful and friendly."

        chat_response = client.chat.completions.create(
            model=model,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are Jobsy AI, a friendly and knowledgeable job search assistant. "
                        "Help the user with their job search, career advice, interview tips, "
                        "resume guidance, and anything related to finding a job. "
                        "Be concise, warm, and helpful.\n\n"
                        f"USER CONTEXT:\n{personal_context}"
                    ),
                },
                *context_messages,
                {"role": "user", "content": user_message},
            ],
            temperature=0.7,
            max_tokens=500,
        )

        reply = chat_response.choices[0].message.content.strip()

        save_conversation_turn(
            conversation_id=conversation_id,
            user_message=user_message,
            assistant_message=reply,
            user_id=user_id,
        )

        return {
            "response": reply,
            "conversation_id": conversation_id,
            "metadata": {"plan": plan},
        }


    validation = validate_plan(plan)

    if validation["status"] == "BLOCKED":
        save_conversation_turn(
            conversation_id=conversation_id,
            user_message=user_message,
            assistant_message=validation["message"],
            user_id=user_id,
        )

        return {
            "response": validation["message"],
            "conversation_id": conversation_id,
            "metadata": {"plan": plan},
        }

    if validation["status"] == "NEEDS_CONFIRMATION":
        save_conversation_turn(
            conversation_id=conversation_id,
            user_message=user_message,
            assistant_message=validation["message"],
            user_id=user_id,
        )

        return {
            "response": validation["message"],
            "conversation_id": conversation_id,
            "metadata": {"plan": plan},
        }

    # -----------------------------
    # 5. Resolve missing messageId for email_reply_preview
    # -----------------------------
    if plan["pipeline"] == "email_reply_preview" and not plan["args"].get("messageId"):
        resolved_id = await _resolve_message_id(
            user_message=user_message,
            jwt=jwt,
        )
        if not resolved_id:
            reply = (
                "I couldn't find that email in your inbox. "
                "Could you be more specific — e.g. the subject line or sender's name?"
            )
            save_conversation_turn(conversation_id, user_message, reply)
            return {"response": reply, "conversation_id": conversation_id, "metadata": {"plan": plan}}
        plan["args"]["messageId"] = resolved_id

    # -----------------------------
    # 6. Execute pipeline
    # -----------------------------
    result = await run_pipeline(
        pipeline_name=plan["pipeline"],
        endpoint=plan["endpoint"],
        args=plan["args"],
        jwt=jwt,
    )

    # -----------------------------
    # 6b. Short-circuit for interview_prep
    # The pipeline already runs GPT internally and returns polished advice.
    # Re-summarizing would lose quality — return the advice directly.
    # -----------------------------
    if plan["pipeline"] == "interview_prep" and result.get("advice"):
        advice_reply = result["advice"]
        if not result.get("hasResume"):
            advice_reply = "⚠️ I couldn't find your resume. Please upload it from the Resume page for more personalized advice.\n\n" + advice_reply
        if not result.get("hasEmail"):
            advice_reply += "\n\n⚠️ I couldn't find a specific interview email from this company, so the advice is based on general knowledge."
        save_conversation_turn(
            conversation_id=conversation_id,
            user_message=user_message,
            assistant_message=f"Gave interview prep advice for {result.get('company')}",
            user_id=user_id,
        )
        return {
            "response": advice_reply,
            "conversation_id": conversation_id,
            "metadata": {"plan": plan},
        }

    # -----------------------------
    # 7. Summarize result into human-readable reply
    # -----------------------------
    from client.llm.openai_client import get_openai_client, get_openai_model
    import json as _json

    _client = get_openai_client()
    _model = get_openai_model()

    try:
        result_text = _json.dumps(result, indent=2) if isinstance(result, dict) else str(result)
    except Exception:
        result_text = str(result)

    summary_response = _client.chat.completions.create(
        model=_model,
        messages=[
            {
                "role": "system",
                "content": (
                    "You are Jobsy AI, a precise and friendly job search assistant. "
                    "You will be given raw pipeline result data and must summarize it for the user. "
                    "\n\n"
                    "STRICT ACCURACY RULES — YOU MUST FOLLOW THESE:\n"
                    "1. NEVER invent, infer, or assume any information not explicitly present in the data.\n"
                    "2. Use EXACT values from the data: sender names, company names, email subjects, counts, dates.\n"
                    "3. If the data says 'from' is 'Ritvik Rai <rai.ritvik2005@gmail.com>', the sender is 'Ritvik Rai', NOT 'Gmail'.\n"
                    "4. Only mention things that are ACTUALLY in the data. If there are 0 rejections, do not mention rejections.\n"
                    "5. If a count is 0, do not say 'no X yet' — simply omit that category entirely.\n"
                    "6. Do NOT infer application status from email types unless explicitly stated in the data.\n"
                    "7. For emails: use the 'subject', 'from', and 'type' fields exactly as given.\n"
                    "8. For jobs: use the exact title, company, salary, and URL from the data.\n"
                    "\n"
                    "FORMAT RULES:\n"
                    "- Be concise, warm, and friendly.\n"
                    "- Use markdown: bold for names/companies, bullet points for lists.\n"
                    "- Keep it under 250 words.\n"
                    "- Never show raw JSON or field names like 'emailId', '_id', 'lastSubject', 'emailCount', 'lastContact'.\n"
                    "- For interview emails: show the subject, sender, date naturally. E.g. '**Flipkart** — Interview Scheduled for March 30 at 10:30 AM'.\n"
                    "- Never use technical grouping fields. Present each email as a human-readable item.\n"
                    "- If data has a meeting link, show it as a clickable link."
                ),
            },
            {"role": "user", "content": f"User asked: {user_message}"},
            {"role": "assistant", "content": f"Pipeline result data (use ONLY this data, nothing else):\n{result_text}"},
            {"role": "user", "content": "Summarize this accurately using only the data above. Do not invent anything."},
        ],
        temperature=0.1,
        max_tokens=600,
    )

    human_reply = summary_response.choices[0].message.content.strip()

    # -----------------------------
    # 8. Persist memory
    # -----------------------------
    # NEVER save the raw pipeline result or human_reply (which contains real
    # email/job data) into conversation history. The LLM will repeat it as
    # fact on every future turn — even for different users after logout.
    # Save only a short neutral note about what action was taken.
    memory_note = f"Ran pipeline '{plan['pipeline']}' successfully."
    save_conversation_turn(
        conversation_id=conversation_id,
        user_message=user_message,
        assistant_message=memory_note,
        user_id=user_id,
    )

    # -----------------------------
    # 9. Final response
    # -----------------------------
    return {
        "response": human_reply,
        "conversation_id": conversation_id,
        "metadata": {"plan": plan},
    }
