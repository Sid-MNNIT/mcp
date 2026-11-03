import React from "react";

// ─── SVG icon helpers ──────────────────────────────────────────────────────────
const CalendarIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);
const CompanyIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);
const StarIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  </svg>
);
const RoleIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M20 7H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z" />
    <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
  </svg>
);
const ProjectIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="16 18 22 12 16 6" />
    <polyline points="8 6 2 12 8 18" />
  </svg>
);
const EducationIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
    <path d="M6 12v5c3 3 9 3 12 0v-5" />
  </svg>
);
const BuildingIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
    <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
  </svg>
);

// ─── Stat box ───────────────────────────────────────────────────────────────
const StatBox = ({ icon, value, label }) => (
  <div className="stat-box">
    <div className="stat-icon">{icon}</div>
    <div className="stat-value">{value}</div>
    <div className="stat-label">{label}</div>
  </div>
);

// ─── Count words/lines in a section string (rough project count proxy) ────────
const countProjects = (text = "") => {
  return parseProjects(text).length || (text.trim() ? 1 : 0);
};

// ─── Parse projects into structured entries ──────────────────────────────────
// A "project heading" line is one that:
//   - Is not a pure date  (e.g. "December 2025- Present")
//   - Is not a pure URL   (e.g. "github.com/..." or "GitHub")
//   - Is not a tech stack line (short comma-separated tech list)
//   - Is not a bullet detail line (starts with - or bullet)
const DATE_LINE_RE   = /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december|present|\d{4})/i;
const URL_LINE_RE    = /^(https?:\/\/|www\.|github\.com|gitlab\.com|linkedin\.com)/i;
const GITHUB_RE      = /^github$/i;
// 2+ comma-separated short tokens = tech stack (catches "LLM, FastMCP" etc.)
const TECH_STACK_RE  = /^([A-Za-z0-9.#+\- ]{1,30}(,\s*[A-Za-z0-9.#+\- ]{1,30}){1,})$/;
// Both ASCII dash bullet AND em-dash (–) used in PDF bullet points
const BULLET_LINE_RE = /^[-*–—]/;
// Sentence starters — lines that are clearly descriptions, not project titles
const DESCRIPTION_RE = /^(a |an |the |this |with |using |for |built |developed |developing |creating |designed |designing |integrated |integrating |organized |organiz|building |implement|support|enabling |enabling|tools |tools:|technologies|framework)/i;
// Education content that should never appear as a project title
const EDU_CONTENT_RE = /\b(board|cbse|icse|igcse|central board|state board|matriculation|percentage|cgpa|cpi|gpa|sgpa|b\.?tech|b\.?e\.?|bachelor|master|diploma|pursuing|enrolled|school|college|university|institute|rajasthan|jharkhand|lucknow|prayagraj|jamshedpur|allahabad|class\s+[xivXIV]+|class\s+\d+|std\.?\s+\d+)\b/i;
// Score/percentage patterns that identify education lines (e.g. "ICSE (Class X) | 98.4%")
const SCORE_LINE_RE = /[\d.]+\s*%|\|\s*[\d.]+/;

// Strip trailing " | GitHub" or "| GitHub" from project title lines
const stripGithubSuffix = (s) => s.replace(/\s*\|?\s*github\s*$/i, "").trim();

const isProjectHeading = (line) => {
  // Strip leading bullet/dash that normalize_text adds from PDF bullet chars (•→-)
  const stripped = stripGithubSuffix(line.replace(/^[-*–—]\s*/, ""));
  if (!stripped || stripped.length < 3)        return false;
  if (DATE_LINE_RE.test(stripped))             return false;
  if (URL_LINE_RE.test(stripped))              return false;
  if (GITHUB_RE.test(stripped.trim()))         return false;
  if (TECH_STACK_RE.test(stripped))            return false;
  if (BULLET_LINE_RE.test(stripped))           return false;  // still a bullet after strip = nested bullet
  if (DESCRIPTION_RE.test(stripped))           return false;  // sentence description, not a title
  if (EDU_CONTENT_RE.test(stripped))           return false;  // education content, not a project title
  if (SCORE_LINE_RE.test(stripped))            return false;  // has a score/percentage = education line
  if (stripped.length > 80)                    return false;  // generous limit for descriptive titles
  if (stripped.includes(" via "))              return false;  // "connecting them to backend via REST API"
  if (stripped.includes(" using ") && stripped.length > 40) return false;  // long "using" sentences
  // Bare API/SDK/lib names are detail fragments, not project titles
  if (/\b(API|SDK|CLI|UI|DB|ORM|JWT|REST|MCP|RAG|LLM|NLP)$/.test(stripped)) return false;
  if (!/^[A-Z0-9"'([]/.test(stripped))        return false;
  return true;
};

// Strip leading bullet from project name for display, also strip trailing | GitHub
const stripBullet = (line) => stripGithubSuffix(line.replace(/^[-*–—]\s*/, ""));

const parseProjects = (text = "") => {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const projects = [];
  let current = null;

  for (const line of lines) {
    if (isProjectHeading(line)) {
      if (current) projects.push(current);
      current = { name: stripBullet(line), details: [] };
    } else if (current) {
      if (!GITHUB_RE.test(line) && !URL_LINE_RE.test(line)) {
        current.details.push(line);
      }
    }
  }
  if (current) projects.push(current);
  return projects;
};

// ─── Parse education into structured entries ─────────────────────────────────
const YEAR_RE_EDU = /^\d{4}$|\b(20\d{2})\b/;
// CPI is used in some institutes (e.g. MNNIT), added alongside CGPA/GPA
const SCORE_RE    = /cgpa|cpi|gpa|sgpa|%|percentage|score/i;
const DEGREE_RE   = /b\.?tech|b\.?e|b\.?sc|m\.?tech|m\.?sc|mca|bca|bachelor|master|diploma|engineering|science/i;

const parseEducation = (text = "") => {
  // Your PDF uses two-column layout so lines come out as:
  //   "-INSTITUTE NAME, CITY   2028"
  //   "DEGREE BOARD   CGPA/Percentage: 9.57"
  // Pre-process each raw line to split these compound patterns apart.
  const rawLines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const lines = [];

  for (const line of rawLines) {
    const clean = line.replace(/^[-*]\s*/, ""); // strip leading bullet

    // Pattern 1a: "INSTITUTE NAME   2024 – 2028" — institute + year range on same line
    // Extract the graduation (end) year from the range
    const instYearRangeMatch = clean.match(/^(.+?)\s+(20\d{2}|19\d{2})\s*[–\-–]\s*(20\d{2}|19\d{2})\s*$/);
    if (instYearRangeMatch && /university|college|institute|school|iit|nit|bits|academy/i.test(instYearRangeMatch[1])) {
      lines.push(instYearRangeMatch[1].trim());
      lines.push(instYearRangeMatch[3]); // use end year (graduation year)
      continue;
    }

    // Pattern 1b: "INSTITUTE NAME   2028" — institute + single year on same line
    const instYearMatch = clean.match(/^(.+?)\s+(20\d{2}|19\d{2})\s*$/);
    if (instYearMatch && /university|college|institute|school|iit|nit|bits|academy/i.test(instYearMatch[1])) {
      lines.push(instYearMatch[1].trim());
      lines.push(instYearMatch[2]);
      continue;
    }

    // Pattern 2a: "DEGREE | CPI: 9.29" or "DEGREE | CGPA: 9.57" — pipe-separated degree + score
    const pipeSplit = clean.match(/^(.+?)\s*\|\s*(cgpa|cpi|gpa|sgpa|percentage|score)[:/\s]+([\d.]+)\s*(.*)$/i);
    if (pipeSplit) {
      if (pipeSplit[1].trim()) lines.push(pipeSplit[1].trim());
      lines.push(`${pipeSplit[2]}: ${pipeSplit[3]}`);
      continue;
    }

    // Pattern 2b: "DEGREE   CGPA/Percentage: 9.57" — degree + score on same line
    const degreeScoreMatch = clean.match(/^(.+?)\s+(cgpa|cpi|gpa|sgpa|percentage|score)[/:]?\s*([\d.]+)\s*$/i);
    if (degreeScoreMatch) {
      if (degreeScoreMatch[1].trim()) lines.push(degreeScoreMatch[1].trim());
      lines.push(`${degreeScoreMatch[2]}: ${degreeScoreMatch[3]}`);
      continue;
    }

    // Pattern 3: concatenated "...2028CGPA/Percentage: 9.57" (no space between year and CGPA)
    const concatMatch = clean.match(/^(.+?)(\d{4})(cgpa|gpa|sgpa|percentage|score)[:/]?\s*([\d.]+)\s*$/i);
    if (concatMatch) {
      if (concatMatch[1].trim()) lines.push(concatMatch[1].trim());
      lines.push(concatMatch[2]);
      lines.push(`${concatMatch[3]}: ${concatMatch[4]}`);
      continue;
    }

    lines.push(clean);
  }

  const entries = [];
  let current = null;

  for (const line of lines) {
    const isInstitute = /university|college|institute|school|iit|nit|bits|academy/i.test(line);
    const isDegree    = DEGREE_RE.test(line);
    const isYear      = /^(20\d{2}|19\d{2})$/.test(line);
    const isScore     = SCORE_RE.test(line);

    if (isInstitute) {
      if (current) entries.push(current);
      current = { institute: line, degree: "", year: "", score: "" };
    } else if (current) {
      if (isDegree && !current.degree)    current.degree = line;
      else if (isYear && !current.year)   current.year   = line;
      else if (isScore && !current.score) {
        // Preserve label + number: "CGPA: 9.57", "CPI: 9.29", "95.4%"
        // Normalise: "cgpa: 9.57" → "CGPA: 9.57"
        const labelMatch = line.match(/^(cgpa|cpi|gpa|sgpa|percentage)\s*[:/]?\s*([\d.]+)/i);
        if (labelMatch) {
          current.score = `${labelMatch[1].toUpperCase()}: ${labelMatch[2]}`;
        } else {
          const numMatch = line.match(/([\d.]+(?:\s*%)?)\s*$/);
          current.score = numMatch ? numMatch[1] : line;
        }
      }
    } else {
      if (line.length > 5) {
        current = { institute: line, degree: "", year: "", score: "" };
      }
    }
  }
  if (current) entries.push(current);
  return entries;
};

// ─── Parse achievements into clean list ──────────────────────────────────────
const parseAchievements = (text = "") => {
  return text
    .split("\n")
    .map((l) => {
      let s = l.trim().replace(/^[-*–—•]\s*/, ""); // strip all bullet variants
      // Some PDFs concatenate a bold label directly with content e.g.
      // "Problem SolvingSolved 380+ problems..."
      // "Competitive ProgrammingAchieved a maximum..."
      // Pattern: one or more TitleCase words immediately followed by another capital letter starting the real content
      // Keep only the content part (after the label)
      s = s.replace(/^(?:[A-Z][a-z]+\s*)+([A-Z][a-z])/, "$1");
      return s;
    })
    .filter((l) => {
      if (l.length <= 3) return false;
      // filter out section headings
      if (/^(positions?|of|responsibility|declaration|references)/i.test(l)) return false;
      // filter out pure date lines like "July 2025- Present"
      if (DATE_LINE_RE.test(l)) return false;
      // filter out short role/title-only lines (<=3 words, no achievement keywords)
      if (l.split(" ").length <= 3 && !/solved|secured|position|pupil|rank|winner|award|rating|achieved/i.test(l)) return false;
      // filter out programme/club names
      if (/^(student mentorship|mentorship program|gnosis|quiz club|program,|club$|committee$|society$)/i.test(l)) return false;
      // filter out pure responsibility/duty sentences (action verbs for ongoing work)
      if (/^(organized|conducting|helping|managing|leading|coordinating|working|supporting|enabling|integrated|designing|contributed|conceptualized)/i.test(l)) return false;
      return true;
    })
    .slice(0, 5);
};

// ─── Profile detection (mirrors ats_scorer.py logic, client-side) ────────────
const detectProfile = (entities, sections) => {
  const totalMonths  = entities.total_months ?? 0;
  const hasEducation = !!(sections?.education?.trim());
  const hasProjects  = !!(sections?.projects?.trim());
  const seniority    = entities.seniority ?? [];
  if (entities.is_student && totalMonths < 24) return "student";
  if (totalMonths < 12 && hasEducation && hasProjects) return "student";
  if (totalMonths < 6  && (seniority.includes("intern") || seniority.includes("trainee")))
    return "student";
  if (totalMonths < 24) return "early_career";
  return "professional";
};

// ─── Component ───────────────────────────────────────────────────────────────
const ResumeMetadata = ({ metadataData }) => {
  if (!metadataData) {
    return (
      <div className="resume-column">
        <div className="resume-card">
          <div className="resume-card-header"><h3>Key Insights</h3></div>
          <div className="empty-message">
            <div className="empty-icon">
              <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
            </div>
            <p>Key insights will appear here after analysis</p>
          </div>
        </div>
      </div>
    );
  }

  const entities  = metadataData.entities  || {};
  const sections  = metadataData.sections  || {};
  const profile   = detectProfile(entities, sections);

  const skills    = entities.skills    || [];
  const companies = entities.companies || [];
  const roles     = entities.roles     || [];
  const expYears  = entities.experience_years  ?? 0;
  const expMonths = entities.experience_months ?? 0;

  const expDisplay =
    expYears > 0
      ? `${expYears}yr${expMonths > 0 ? ` ${expMonths}mo` : ""}`.trim()
      : `${expMonths}mo`;

  const projectCount = countProjects(sections.projects);
  const hasEducation = !!(sections.education?.trim());
  const hasProjects  = !!(sections.projects?.trim());
  const hasAchiev    = !!(sections.achievements?.trim());
  const hasCerts     = !!(sections.certifications?.trim());

  const isStudent = profile === "student";
  const isEarly   = profile === "early_career";

  return (
    <div className="resume-column">
      <div className="resume-card">
        <div className="resume-card-header"><h3>Key Insights</h3></div>

        <div className="metadata-content">

          {/* STAT BOXES */}
          <div className="metadata-stats">
            {isStudent ? (
              <>
                <StatBox icon={<ProjectIcon />}  value={hasProjects ? projectCount || "✓" : "0"} label="Projects" />
                <StatBox icon={<EducationIcon />} value={hasEducation ? "✓" : "–"} label="Education" />
                <StatBox icon={<StarIcon />}      value={skills.length}  label="Skills" />
                <StatBox icon={<RoleIcon />}      value={roles.length}   label="Roles" />
              </>
            ) : isEarly ? (
              <>
                <StatBox icon={<CalendarIcon />} value={expDisplay}       label="Experience" />
                <StatBox icon={<CompanyIcon />}  value={companies.length} label="Companies" />
                <StatBox icon={<StarIcon />}     value={skills.length}    label="Skills" />
                <StatBox icon={<RoleIcon />}     value={roles.length}     label="Roles" />
              </>
            ) : (
              <>
                <StatBox icon={<CalendarIcon />} value={expDisplay}       label="Experience" />
                <StatBox icon={<CompanyIcon />}  value={companies.length} label="Companies" />
                <StatBox icon={<StarIcon />}     value={skills.length}    label="Skills Listed" />
                <StatBox icon={<RoleIcon />}     value={roles.length}     label="Roles Detected" />
              </>
            )}
          </div>

          {/* TOP SKILLS */}
          {skills.length > 0 && (
            <div className="metadata-section">
              <h4>Top Skills</h4>
              <div className="skills-list">
                {skills.slice(0, 8).map((skill, i) => (
                  <span key={i} className="skill-item">{skill}</span>
                ))}
                {skills.length > 8 && (
                  <span className="skill-item skill-more">+{skills.length - 8} more</span>
                )}
              </div>
            </div>
          )}

          {/* PROJECTS */}
          {(isStudent || isEarly) && hasProjects && (() => {
            const projects = parseProjects(sections.projects);
            if (!projects.length) return null;
            return (
              <div className="metadata-section">
                <h4>Projects ({projects.length})</h4>
                <div className="projects-preview">
                  {projects.slice(0, 4).map((proj, i) => (
                    <div key={i} className="project-entry">
                      <div className="project-line">
                        <span className="project-bullet" />
                        <span className="project-name">{proj.name}</span>
                      </div>
                      {proj.details
                        .filter((d) => DATE_LINE_RE.test(d))
                        .slice(0, 1)
                        .map((d, j) => (
                          <div key={j} className="project-detail">{d}</div>
                        ))}
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* EDUCATION */}
          {hasEducation && (() => {
            const eduEntries = parseEducation(sections.education);
            if (!eduEntries.length) return null;
            return (
              <div className="metadata-section">
                <h4>Education</h4>
                <div className="education-preview">
                  {eduEntries.slice(0, 2).map((edu, i) => (
                    <div key={i} className="education-entry">
                      <div className="education-institute">{edu.institute}</div>
                      {edu.degree && <div className="education-degree">{edu.degree}</div>}
                      <div className="education-meta">
                        {edu.year  && <span className="education-year">Batch of {edu.year}</span>}
                        {edu.score && <span className="education-score">{edu.score}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* WORK HISTORY */}
          {!isStudent && companies.length > 0 && (
            <div className="metadata-section">
              <h4>Work History</h4>
              <div className="companies-list">
                {companies.map((company, i) => (
                  <div key={i} className="company-item">
                    <BuildingIcon />
                    {company}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* INTERNSHIPS — only real companies, not volunteer orgs */}
          {isStudent && companies.length > 0 && (
            <div className="metadata-section">
              <h4>Internships</h4>
              <div className="companies-list">
                {companies.map((company, i) => (
                  <div key={i} className="company-item">
                    <BuildingIcon />
                    {company}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* POSITIONS OF RESPONSIBILITY — from volunteer section */}
          {isStudent && sections.volunteer?.trim() && (() => {
            const lines = sections.volunteer
              .split("\n")
              .map((l) => l.replace(/^[-*–—•]\s*/, "").trim())
              .filter((l) => l.length > 3);
            if (!lines.length) return null;
            return (
              <div className="metadata-section">
                <h4>Positions of Responsibility</h4>
                <div className="projects-preview">
                  {lines.slice(0, 4).map((line, i) => {
                    // split "Role  Date" — date is after 3+ spaces or a tab
                    const dateMatch = line.match(/^(.+?)\s{2,}(.+)$/);
                    const role = dateMatch ? dateMatch[1].trim() : line;
                    const date = dateMatch ? dateMatch[2].trim() : "";
                    // skip pure date-only lines
                    if (/^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|\d{4})/i.test(line)) return null;
                    return (
                      <div key={i} className="project-entry">
                        <div className="project-line">
                          <span className="project-bullet" />
                          <span className="project-name">{role}</span>
                        </div>
                        {date && <div className="project-detail">{date}</div>}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* DETECTED ROLES */}
          {roles.length > 0 && (
            <div className="metadata-section">
              <h4>Detected Roles</h4>
              <div className="skills-list">
                {roles.map((role, i) => (
                  <span key={i} className="skill-item">{role}</span>
                ))}
              </div>
            </div>
          )}

          {/* ACHIEVEMENTS */}
          {(isStudent || isEarly) && hasAchiev && (() => {
            const achievements = parseAchievements(sections.achievements);
            if (!achievements.length) return null;
            return (
              <div className="metadata-section">
                <h4>Achievements</h4>
                <div className="projects-preview">
                  {achievements.map((line, i) => (
                    <div key={i} className="project-line">
                      <span className="project-bullet" />
                      <span className="project-name">{line}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* CERTIFICATIONS */}
          {(isStudent || isEarly) && hasCerts && (
            <div className="metadata-section">
              <h4>Certifications</h4>
              <div className="education-preview">
                {sections.certifications
                  .split("\n")
                  .filter((l) => l.trim())
                  .slice(0, 3)
                  .map((line, i) => (
                    <div key={i} className="education-line">{line.trim()}</div>
                  ))}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

export default ResumeMetadata;