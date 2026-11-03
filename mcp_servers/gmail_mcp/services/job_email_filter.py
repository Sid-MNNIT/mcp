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


def _is_noise(sender: str, subject: str) -> bool:
    """True for senders/subjects we never want, whatever the body says."""

    # Hard exclusion by domain
    if any(domain in sender for domain in BLOCKED_DOMAINS):
        return True

    # Hard exclusion by sender keyword (catches subdomain variations)
    if any(keyword in sender for keyword in BLOCKED_SENDER_KEYWORDS):
        return True

    # Hard exclusion for newsletters / system notifications, even when
    # they mention "interview" or "hiring" in the body.
    return _looks_like_notification(sender, subject)


# -----------------------------
# STEP 1: CHEAP CHECK (headers only, no body downloaded yet)
# -----------------------------
def passes_header_check(email: dict) -> bool:
    """
    Runs on the small "metadata" version of a message (From, Subject and the
    bulk-mail headers). False means "definitely not a job email", so we never
    download its body.
    """
    sender = (email.get("from") or "").lower()
    subject = (email.get("subject") or "").lower()

    if _is_noise(sender, subject):
        return False

    # Mass mailings carry a List-Unsubscribe / Precedence: bulk header. Real
    # recruiter mail normally does not, but some company systems add it, so
    # we only trust this signal for senders we do not already trust.
    if email.get("isBulk") and not any(d in sender for d in TRUSTED_DOMAINS + ATS_DOMAINS):
        return False

    return True


# -----------------------------
# RULE-BASED LABEL (skips the LLM)
# -----------------------------
# Recruitment systems send very predictable mail. When the sender is one of
# them AND the wording is clear, the rules can name the type themselves.
ATS_DOMAINS = [
    "greenhouse.io",
    "lever.co",
    "myworkdayjobs.com",
    "workday.com",
    "successfactors.com",
    "smartrecruiters.com",
]

RULE_PHRASES = {
    "REJECTION": [
        "we regret to inform",
        "not moving forward",
        "move forward with other candidates",
        "decided to move forward with candidates",
        "not selected",
        "profile does not align",
    ],
    "OFFER": [
        "offer letter",
        "we are pleased to offer",
        "we are happy to offer",
        "happy to offer you",
        "pleased to extend an offer",
    ],
    "INTERVIEW": [
        "interview invitation",
        "invite you to interview",
        "interview scheduled",
        "schedule an interview",
        "like to invite you",
        "phone screen",
        "technical interview",
        "virtual interview",
        "video interview",
        "round of interview",
    ],
    # Weakest group: "thank you for applying" also opens most rejections,
    # so it only counts when none of the groups above matched.
    "JOB": [
        "thank you for applying",
        "we received your application",
        "application received",
    ],
}


def rule_based_type(email: dict):
    """
    Returns "REJECTION", "OFFER", "INTERVIEW" or "JOB" when the rules are
    sure, otherwise None (and the email goes to the LLM as before).
    """
    sender = (email.get("from") or "").lower()
    if not any(domain in sender for domain in ATS_DOMAINS):
        return None

    # Subject + start of the body only, so quoted old messages do not confuse us
    text = f"{email.get('subject') or ''} {(email.get('body') or '')[:2000]}".lower()

    matched = [
        mail_type
        for mail_type, phrases in RULE_PHRASES.items()
        if any(phrase in text for phrase in phrases)
    ]
    strong = [t for t in matched if t != "JOB"]

    if len(strong) == 1:
        return strong[0]
    if not strong and "JOB" in matched:
        return "JOB"
    return None  # nothing matched, or two strong types matched: let the LLM decide


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

    if _is_noise(sender, subject):
        return False

    score = compute_job_score(email)

    return score >= threshold