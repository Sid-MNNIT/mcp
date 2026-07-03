# -----------------------------
# HARD BLOCKED DOMAINS
# -----------------------------
# These platforms send feed-style / marketing emails
# NOT real job communications
BLOCKED_DOMAINS = [
    # Job aggregators — send feed/alert emails, not real recruiter comms
    "linkedin.com",
    "linkedinmail.com",
    "notifications.linkedin.com",
    "careers.linkedin.com",
    "glassdoor.com",
    "indeed.com",
    "naukri.com",
    "monster.com",
    "wellfound.com",
    "cutshort.io",

    # Contest / hackathon / internship marketing platforms
    # These send "your profile is a match" bulk marketing emails
    # which are NOT real job communications
    "dare2compete.news",
    "dare2compete.com",
    "unstop.com",
    "unstop.co",
    "d2c.unstop.com",

    # Other common marketing/newsletter job platforms
    "internshala.com",
    "shine.com",
    "foundit.in",
    "hirist.com",
    "apna.co",
    "freshersworld.com",
    "placementindia.com",
    "careerjet.co.in",

    # Coaching/content marketing platforms
    "propeers.in",
]

# -----------------------------
# TRUSTED RECRUITMENT DOMAINS
# -----------------------------
TRUSTED_DOMAINS = [
    "greenhouse.io",
    "lever.co",
    "workday.com",
    "myworkdayjobs.com",
    "successfactors.com",
    "smartrecruiters.com",

    # Big tech & companies
    "amazon.com",
    "google.com",
    "microsoft.com",
    "meta.com",
    "apple.com",
    "uber.com",
    "flipkart.com",
    "swiggy.com",
    "zomato.com",
]

# -----------------------------
# GENERIC JOB KEYWORDS
# -----------------------------
JOB_KEYWORDS = [
    "job",
    "role",
    "position",
    "opening",

    "interview",
    "hiring",
    "recruiter",
    "recruitment",

    "application",
    "applied",
    "shortlisted",
    "shortlist",

    "offer",
    "offer letter",
    "joining",
    "onboarding",

    "assessment",
    "coding test",
    "technical round",
    "hr round",
    "assignment",
    "challenge",

    "intern",
    "internship",
]

# -----------------------------
# STRONG INTENT PHRASES
# -----------------------------
# These indicate REAL job communication
INTENT_PHRASES = [
    "thank you for applying",
    "we received your application",
    "application received",

    "interview scheduled",
    "invite you to interview",
    "interview invitation",

    "shortlisted",
    "offer letter",
    "we are pleased to offer",
    "we are happy to offer",
    "happy to offer you",
    "pleased to extend an offer",

    "we regret to inform",
    "not selected",
    "unfortunately",

    # 🔑 Subtle rejection phrases
    "decided to move forward with candidates",
    "move forward with other candidates",
    "not moving forward",
    "profile does not align",

    # Common interview scheduling phrases
    "schedule an interview",
    "schedule a call",
    "schedule a meeting",
    "like to invite you",
    "would like to connect",
    "looking forward to speaking",
    "next steps",
    "move forward with your application",
    "pleased to inform",
    "happy to inform",
    "selected for",
    "selected you",
    "round of interview",
    "technical interview",
    "hr interview",
    "virtual interview",
    "video interview",
    "phone screen",
    "hiring process",
    "recruitment process",
]

# -----------------------------
# SCORING FUNCTION
# -----------------------------
def compute_job_score(email: dict) -> int:
    """
    Returns a score representing how likely this email
    is a REAL job-related communication.
    """

    score = 0

    subject = (email.get("subject") or "").lower()
    sender = (email.get("from") or "").lower()
    body = (email.get("body") or "").lower()

    text = f"{subject} {body}"

    # Strong intent phrases → high confidence
    if any(phrase in text for phrase in INTENT_PHRASES):
        score += 4

    # Trusted recruiter / company domain
    if any(domain in sender for domain in TRUSTED_DOMAINS):
        score += 3

    # Generic job keywords
    if any(keyword in text for keyword in JOB_KEYWORDS):
        score += 2

    return score


# -----------------------------
# BLOCKED SENDER KEYWORDS
# -----------------------------
# Caught by sender name rather than domain
# for cases where subdomain varies
BLOCKED_SENDER_KEYWORDS = [
    "propeers",
    "unstop",
    "dare2compete",
    "internshala",
    "noreply@shine",
    "noreply@apna",
    "noreply@foundit",
    "noreply@hirist",
]


# -----------------------------
# NOTIFICATION / NEWSLETTER PATTERNS
# -----------------------------
# These are noise sources that DO mention job keywords ("interview",
# "hiring", "career") but never carry a real job communication.
# Filtering them here avoids paying LLM tokens on obvious garbage.
NOTIFICATION_SENDER_PATTERNS = [
    # Google system notifications — security alerts, sign-ins, verifications
    "no-reply@accounts.google.com",
    "noreply@accounts.google.com",
    "no-reply@google.com",
    "noreply@google.com",

    # Content / practice platforms that spam "interview prep" content
    "leetcode.com",
    "hackerrank.com",
    "hackerearth.com",
    "codechef.com",
    "geeksforgeeks.org",
    "interviewbit.com",

    # Newsletter / blog platforms
    "substack.com",
    "@medium.com",
    "@quora.com",
    "mailchimp",
    "sendgrid",
    "constantcontact",

    # Generic notification mailboxes
    "notifications@",
    "digest@",
    "newsletter@",
    "updates@",
    "news@",
    "no-reply@github.com",
    "noreply@github.com",
]

NOTIFICATION_SUBJECT_PATTERNS = [
    # Digest / newsletter markers
    "weekly digest",
    "daily digest",
    "monthly digest",
    "weekly update",
    "daily update",
    "newsletter",
    "your weekly",
    "your daily",

    # Security / account notifications
    "security alert",
    "sign-in attempt",
    "sign in attempt",
    "verification code",
    "verify your email",
    "confirm your email",
    "password reset",
    "reset your password",
    "two-factor",

    # Transactional
    "your receipt",
    "invoice for",
    "shipping confirmation",
    "order confirmation",
    "your order",

    # Onboarding fluff
    "welcome to",
    "welcome back",

    # Practice / contest platforms
    "leetcode contest",
    "leetcode weekly",
    "coding contest",
    "hackathon",
]


def _looks_like_notification(sender: str, subject: str) -> bool:
    """True if the email is a newsletter / notification / system alert."""
    if any(pat in sender for pat in NOTIFICATION_SENDER_PATTERNS):
        return True
    if any(pat in subject for pat in NOTIFICATION_SUBJECT_PATTERNS):
        return True
    return False


# -----------------------------
# FINAL DECISION FUNCTION
# -----------------------------
def is_job_related(email: dict, threshold: int = 2) -> bool:
    """
    Decide if an email should be passed to LLM for validation.
    Recall-focused — accepts anything remotely job-adjacent — but
    aggressively rejects known notification/newsletter patterns first
    so obvious noise never reaches the LLM.
    """

    sender = (email.get("from") or "").lower()
    subject = (email.get("subject") or "").lower()

    # Hard exclusion by domain
    if any(domain in sender for domain in BLOCKED_DOMAINS):
        return False

    # Hard exclusion by sender keyword (catches subdomain variations)
    if any(keyword in sender for keyword in BLOCKED_SENDER_KEYWORDS):
        return False

    # Hard exclusion for newsletters / system notifications, even when
    # they mention "interview" or "hiring" in the body.
    if _looks_like_notification(sender, subject):
        return False

    score = compute_job_score(email)

    return score >= threshold