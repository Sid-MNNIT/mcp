import re
import json
import logging

logger = logging.getLogger(__name__)

SECTION_ALIASES = {
    "summary":        ["summary", "professional summary", "career summary", "executive summary",
                       "profile", "professional profile", "about me", "about", "objective",
                       "career objective", "personal statement", "overview"],
    "experience":     ["experience", "work experience", "professional experience", "employment",
                       "employment history", "work history", "career history", "internships",
                       "internship", "relevant experience", "positions held"],
    "projects":       ["projects", "project", "personal projects", "academic projects",
                       "key projects", "project work", "project experience", "portfolio",
                       "open source", "open-source contributions"],
    "skills":         ["skills", "technical skills", "technologies", "tech stack", "tools",
                       "core competencies", "key skills", "areas of expertise", "expertise",
                       "technical expertise", "programming skills", "technical proficiencies",
                       "skills & technologies", "tools & technologies", "skills & tools",
                       "technical skills and interests", "skills and interests",
                       "technical skills & interests"],
    "education":      ["education", "academics", "academic background", "qualifications",
                       "educational background", "academic history", "degrees"],
    "certifications": ["certifications", "certificates", "licenses", "courses", "training",
                       "professional development", "workshops", "online courses"],
    "achievements":   ["achievements", "accomplishments", "awards", "honors", "honours",
                       "recognition", "prizes", "distinctions", "scholarships"],
    "publications":   ["publications", "papers", "research", "patents"],
    "volunteer":      ["volunteer", "volunteering", "community service",
                       "extracurricular", "extracurricular activities", "leadership",
                       "positions of responsibility", "position of responsibility",
                       "responsibilities"],
    "languages":      ["languages", "language skills", "spoken languages"],
    "interests":      ["interests", "hobbies", "hobbies & interests"],
    "other":          ["other", "other information", "additional information",
                       "miscellaneous", "references", "declaration",
                       "coding profiles", "coding profile", "competitive programming",
                       "online profiles", "profiles"],
}

ALL_KEYS = list(SECTION_ALIASES.keys())

# ---------------------------------------------------------------------------
# Lines that look like headings but are NOT -- must be rejected before matching.
# These patterns fire on content lines (school names, degrees, boards, etc.)
# that could accidentally match heading heuristics.
# ---------------------------------------------------------------------------
_NOT_A_HEADING_RE = re.compile(
    r"""
    # Board / affiliation names
    \b(board|cbse|icse|igcse|state\s+board|central\s+board|matriculation)\b
    # Score / grade lines
    |\b(cgpa|cpi|gpa|sgpa|percentage|marks|grade|score)\b
    # Contains a year followed by more content (entry line, not a heading)
    |\b(20\d{2}|19\d{2})\b.{4,}
    # Degree / course names
    |\b(b\.?tech|b\.?e\.?|b\.?sc|b\.?s\.?|bca|bba|m\.?tech|m\.?sc|mca|mba|
        bachelor|master|diploma|undergraduate|postgraduate|
        pursuing|enrolled)\b
    # School / college descriptors that appear as content lines
    |\b(public\s+school|international\s+school|army\s+school|convent|vidyalaya|
        high\s+school|secondary\s+school|senior\s+secondary)\b
    # Clearly a long bullet detail line (bullet char + 20+ chars of content)
    |^\s*[-\u2013\u2014\u2022*]\s*.{20,}
    """,
    re.IGNORECASE | re.VERBOSE,
)


# ---------------------------------------------------------------------------
# Build per-section regex patterns (handles mixed case, symbols, etc.)
# ---------------------------------------------------------------------------
def _build_patterns():
    patterns = {}
    for section, aliases in SECTION_ALIASES.items():
        escaped = "|".join(re.escape(a) for a in aliases)
        patterns[section] = re.compile(
            rf"^\s*(?:[-\u2013\u2014\u2022*]+\s*)?(?:{escaped})\s*(?:[:\-\u2013\u2014#*\/|.]+\s*)?(?:\(.*?\))?\s*$",
            re.IGNORECASE,
        )
    return patterns


HEADING_PATTERNS = _build_patterns()

# ALL-CAPS lookup -- EXACT match only (no substring) to avoid false positives.
# e.g. "ELECTRICAL ENGINEERING" must NOT match as "education".
_CAPS_MAP = {alias.upper(): sec for sec, aliases in SECTION_ALIASES.items() for alias in aliases}


def _match_heading(line):
    """Return the canonical section name if `line` is a section heading, else None."""
    s = line.strip()
    if not s:
        return None

    # Hard reject: lines that are clearly content, not headings
    if _NOT_A_HEADING_RE.search(s):
        return None

    # Too long to be a heading
    if len(s) > 60:
        return None

    # Ends with a period -- headings don't do this
    if s.endswith("."):
        return None

    # Pattern match against known aliases (handles Title Case, lower, symbols)
    for section, pattern in HEADING_PATTERNS.items():
        if pattern.match(s):
            return section

    # ALL-CAPS heuristic: <=5 words, all uppercase -- EXACT match only
    if len(s.split()) <= 5 and re.match(r"^[A-Z][A-Z\s&/\-]+$", s):
        normalized = s.strip()
        if normalized in _CAPS_MAP:
            return _CAPS_MAP[normalized]

    return None


# ---------------------------------------------------------------------------
# Two-pass regex split
# ---------------------------------------------------------------------------
def _two_pass_split(text):
    """
    Pass 1: Walk every line and record (line_index, section_name) for headings.
    Pass 2: Slice content between consecutive heading positions.

    This is immune to school/board names appearing inside sections because
    content lines are NEVER re-evaluated for heading-ness after pass 1.
    """
    lines = text.split("\n")

    # Pass 1
    heading_positions = []  # [(line_idx, section_name), ...]
    for i, line in enumerate(lines):
        stripped = line.strip()
        if not stripped:
            continue
        matched = _match_heading(stripped)
        if matched:
            heading_positions.append((i, matched))

    if not heading_positions:
        return {k: "" for k in ALL_KEYS}

    # Pass 2
    sections = {k: [] for k in ALL_KEYS}
    for pos, (line_idx, section_name) in enumerate(heading_positions):
        content_start = line_idx + 1
        content_end = (
            heading_positions[pos + 1][0]
            if pos + 1 < len(heading_positions)
            else len(lines)
        )
        content_lines = [
            l.strip() for l in lines[content_start:content_end] if l.strip()
        ]
        sections[section_name].extend(content_lines)

    return {k: "\n".join(v).strip() for k, v in sections.items()}


# ---------------------------------------------------------------------------
# Lightweight Groq heading verification
# ---------------------------------------------------------------------------
def _groq_verify_headings(text):
    """
    Send only the candidate heading lines (not the full resume) to Groq.
    Groq confirms or corrects each line's section assignment.
    Returns {line_text: section_name} or None on any failure.

    This is cheap: typically 10-20 short lines vs 300+ lines for a full resume.
    """
    try:
        import os
        import sys
        sys.path.insert(0, os.path.dirname(__file__))
        from groq_client import GroqClient

        client = GroqClient()
        lines = text.split("\n")

        # Collect candidates: regex-matched headings + short ALL-CAPS lines not yet matched
        candidates = []
        for line in lines:
            s = line.strip()
            if not s or len(s) > 60:
                continue
            if _match_heading(s) is not None:
                candidates.append(s)
            elif len(s.split()) <= 6 and re.match(r"^[A-Z][A-Z\s&/\-]+$", s):
                candidates.append(s)

        if not candidates:
            return None

        # Deduplicate, preserve order
        seen = set()
        unique_candidates = []
        for c in candidates:
            if c not in seen:
                seen.add(c)
                unique_candidates.append(c)

        prompt = (
            "You are a resume section classifier.\n\n"
            "Below are lines extracted from a resume. Each line may or may not be a section heading.\n"
            "For each line decide:\n"
            "  - Is it a real section heading?\n"
            f"  - If yes, which section from this list: {json.dumps(ALL_KEYS)}\n\n"
            "Return ONLY a valid JSON object mapping each line to its section name, "
            "or null if it is NOT a heading.\n"
            'Example: {"Education": "education", "MNNIT Allahabad": null, "Projects": "projects"}\n\n'
            "Lines to classify:\n"
            + "\n".join(f"- {c}" for c in unique_candidates)
        )

        resp = client._client.chat.completions.create(
            model=client.model,
            messages=[
                {"role": "system", "content": "Output only valid JSON. No markdown. No explanation."},
                {"role": "user", "content": prompt},
            ],
            temperature=0,
            max_tokens=500,
        )
        content = resp.choices[0].message.content.strip()
        if content.startswith("```"):
            content = re.sub(r"^```[a-z]*\n?", "", content).rstrip("`").strip()

        parsed = json.loads(content)
        if not isinstance(parsed, dict):
            return None

        # Keep only assignments that map to a known section
        verified = {k: v for k, v in parsed.items() if v in ALL_KEYS}
        return verified if verified else None

    except Exception as e:
        logger.warning("Groq heading verification failed: %s", e)
        return None


# ---------------------------------------------------------------------------
# Sections that Groq must NEVER remap to certain targets.
# Regex-matched volunteer/education headings are highly reliable — Groq
# consistently mis-classifies "Positions of Responsibility" as "experience".
# ---------------------------------------------------------------------------
_GROQ_NO_REMAP = {
    "volunteer":  {"experience", "achievements", "other"},
    "education":  {"experience", "skills", "other"},
    "projects":   {"experience", "other"},
    "achievements": {"experience", "other"},
}


# ---------------------------------------------------------------------------
# Apply Groq-corrected heading map via two-pass slice
# ---------------------------------------------------------------------------
def _apply_groq_corrections(text, groq_map):
    """
    Re-run the two-pass slice using groq_map to override heading assignments.
    groq_map: {line_text: section_name}  (lines mapped to null are excluded)

    Protected: if regex correctly mapped a heading to a section that is in
    _GROQ_NO_REMAP, Groq may not remap it to a forbidden target.
    """
    lines = text.split("\n")
    nulled = {k for k, v in groq_map.items() if v is None}

    heading_positions = []
    for i, line in enumerate(lines):
        s = line.strip()
        if not s:
            continue

        regex_section = _match_heading(s)   # what regex thinks this is

        if s in groq_map and groq_map[s] is not None:
            groq_section = groq_map[s]
            # Reject Groq override if regex has a protected mapping
            if (
                regex_section is not None
                and regex_section in _GROQ_NO_REMAP
                and groq_section in _GROQ_NO_REMAP[regex_section]
            ):
                heading_positions.append((i, regex_section))  # keep regex result
            else:
                heading_positions.append((i, groq_section))
        elif s not in nulled and regex_section is not None:
            heading_positions.append((i, regex_section))

    if not heading_positions:
        return {k: "" for k in ALL_KEYS}

    sections = {k: [] for k in ALL_KEYS}
    for pos, (line_idx, section_name) in enumerate(heading_positions):
        content_start = line_idx + 1
        content_end = (
            heading_positions[pos + 1][0]
            if pos + 1 < len(heading_positions)
            else len(lines)
        )
        content_lines = [l.strip() for l in lines[content_start:content_end] if l.strip()]
        sections[section_name].extend(content_lines)

    return {k: "\n".join(v).strip() for k, v in sections.items()}


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------
def split_sections(text):
    """
    1. Two-pass regex split  -- fast, deterministic, immune to content confusion.
    2. Groq heading verify   -- only ~10-20 heading lines sent, not full resume.
    3. If Groq improves/confirms: re-slice with corrected headings.
    4. If Groq fails or degrades result: return regex result unchanged.
    """
    if not text or not text.strip():
        return {k: "" for k in ALL_KEYS}

    # Step 1: regex two-pass
    regex_result = _two_pass_split(text)
    non_empty = sum(1 for k, v in regex_result.items() if k != "other" and v.strip())

    if non_empty < 1:
        logger.warning("section_splitter: regex found no sections")
        return regex_result

    # Step 2: Groq lightweight heading verification
    groq_map = _groq_verify_headings(text)

    if groq_map:
        logger.info("section_splitter: Groq verified headings, applying corrections")
        corrected = _apply_groq_corrections(text, groq_map)
        corrected_non_empty = sum(1 for k, v in corrected.items() if k != "other" and v.strip())
        if corrected_non_empty >= non_empty:
            return corrected
        logger.info("section_splitter: Groq corrections degraded result, keeping regex")

    logger.info("section_splitter: using regex result")
<<<<<<< HEAD
    return regex_result
=======
    return regex_result
>>>>>>> a8c47529 (Final working)
