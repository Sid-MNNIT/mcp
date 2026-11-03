"""
Profile Fetcher
===============
Fetches the logged-in user's profile from the Node backend
so the agent can use skills/location in its answers.
"""

import httpx
import base64
import json
import os

NODE_API = os.getenv("NODE_API_URL", "http://localhost:5000")


async def fetch_user_profile(jwt: str) -> dict:
    """
    Calls GET /api/profile/me with the user's JWT.
    Returns a simplified profile dict for use in the agent.
    Returns empty dict on failure (non-blocking).
    """
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(
                f"{NODE_API}/api/profile/me",
                headers={
                    "Authorization": f"Bearer {jwt}",
                    "Content-Type": "application/json",
                },
            )

        if response.status_code != 200:
            return {}

        data = response.json()
        profile = data.get("profile", {})

        # Extract rich profile data
        skills = profile.get("skills", [])
        location = profile.get("location", {})
        city = location.get("city", "")
        country = location.get("country", "India")
        headline = profile.get("headline", "")
        fullname = profile.get("fullname", "")
        age = profile.get("age", None)
        about = profile.get("about", "")
        open_to_work = profile.get("openToWork", False)

        # Latest job title from experience
        experience = profile.get("experience", [])
        current_role = ""
        current_company = ""
        for exp in experience:
            if exp.get("isCurrent"):
                current_role = exp.get("title", "")
                current_company = exp.get("company", "")
                break
        if not current_role and experience:
            current_role = experience[0].get("title", "")
            current_company = experience[0].get("company", "")

        # Latest education
        education = profile.get("education", [])
        latest_degree = ""
        latest_institution = ""
        if education:
            latest_degree = education[0].get("degree", "")
            latest_institution = education[0].get("institution", "")

        return {
            "fullname": fullname,
            "headline": headline,
            "skills": skills,
            "location_city": city,
            "location_country": country,
            "location_string": f"{city}, {country}".strip(", ") if city else country,
            "age": age,
            "about": about,
            "open_to_work": open_to_work,
            "current_role": current_role,
            "current_company": current_company,
            "latest_degree": latest_degree,
            "latest_institution": latest_institution,
        }

    except Exception:
        return {}
