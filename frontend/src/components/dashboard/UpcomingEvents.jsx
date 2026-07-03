import { useState, useEffect } from "react";
import { format, parseISO, isAfter, startOfDay, addDays } from "date-fns";
import { calendarService } from "../../services/calendar.service";
import { deleteCalendarEvent } from "../../utils/api";
import { useSSE } from "../../hooks/useSSE";

function getCompanyInitial(str = "") {
  return str.charAt(0).toUpperCase() || "?";
}

function getEventType(summary = "") {
  const s = summary.toLowerCase();
  if (s.includes("oa") || s.includes("assessment") || s.includes("test")) return "OA Test";
  if (s.includes("interview")) return "Interview";
  if (s.includes("offer")) return "Offer";
  return "Event";
}

function getLogoColor(str = "") {
  const colors = ["#6366f1", "#0ea5e9", "#3b82f6", "#8b5cf6", "#ec4899", "#14b8a6", "#f59e0b"];
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

function getIconType(summary = "") {
  return summary.toLowerCase().includes("interview") ? "user" : "doc";
}

function UserIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
    </svg>
  );
}

function CalIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M3 10h18"/><path d="M8 2v4"/><path d="M16 2v4"/>
    </svg>
  );
}

function ClockIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
    </svg>
  );
}

function LinkIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
    </svg>
  );
}

function BriefcaseIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <path d="M18 6 6 18M6 6l12 12"/>
    </svg>
  );
}

// ── Event Detail Card (modal overlay) ──────────────────────
function EventDetailCard({ event, onClose, onDelete }) {
  if (!event) return null;

  const color = getLogoColor(event.summary);

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0,
          background: "rgba(0,0,0,0.35)",
          backdropFilter: "blur(2px)",
          zIndex: 1100,
          animation: "fadeIn 0.15s ease",
        }}
      />

      {/* Card */}
      <div style={{
        position: "fixed",
        top: "50%", left: "50%",
        transform: "translate(-50%, -50%)",
        zIndex: 1101,
        width: "min(420px, 92vw)",
        background: "var(--bg-card)",
        border: "1.5px solid var(--border-color)",
        borderRadius: "var(--radius-xl)",
        boxShadow: "0 24px 60px -8px rgba(0,0,0,0.28)",
        overflow: "hidden",
        animation: "popIn 0.2s cubic-bezier(0.34,1.56,0.64,1)",
      }}>

        {/* Top accent bar */}
        <div style={{ height: 4, background: color }} />

        {/* Header */}
        <div style={{
          display: "flex", alignItems: "flex-start",
          justifyContent: "space-between",
          padding: "20px 20px 16px",
          borderBottom: "1px solid var(--border-color)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            {/* Company avatar */}
            <div style={{
              width: 46, height: 46,
              borderRadius: "var(--radius-lg)",
              background: color + "22",
              border: `1.5px solid ${color}44`,
              color: color,
              display: "grid", placeItems: "center",
              fontSize: 18, fontWeight: 800,
              flexShrink: 0,
            }}>
              {getCompanyInitial(event.company || event.summary)}
            </div>

            <div>
              <div style={{ fontSize: 16, fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.3px" }}>
                {event.company || event.summary}
              </div>
              <div style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                fontSize: 11, fontWeight: 700,
                color: color,
                background: color + "18",
                padding: "2px 8px",
                borderRadius: 99,
                marginTop: 4,
              }}>
                <UserIcon size={11} />
                {event.type}
              </div>
            </div>
          </div>

          {/* Top-right: Delete + Close */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            {/* Delete button */}
            <button
              onClick={onDelete}
              title="Delete event"
              style={{
                background: "#fee2e2",
                border: "1.5px solid #fecaca",
                borderRadius: "var(--radius-md)",
                width: 32, height: 32,
                display: "grid", placeItems: "center",
                cursor: "pointer",
                color: "#ef4444",
                transition: "background 0.15s, color 0.15s",
              }}
              onMouseEnter={e => { e.currentTarget.style.background = "#ef4444"; e.currentTarget.style.color = "#fff"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "#fee2e2"; e.currentTarget.style.color = "#ef4444"; }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                <path d="M10 11v6"/><path d="M14 11v6"/>
                <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
              </svg>
            </button>

            {/* Close button */}
            <button
              onClick={onClose}
              style={{
                background: "var(--bg-primary)",
                border: "1.5px solid var(--border-color)",
                borderRadius: "var(--radius-md)",
                width: 32, height: 32,
                display: "grid", placeItems: "center",
                cursor: "pointer",
                color: "var(--text-muted)",
                transition: "background 0.15s, color 0.15s",
              }}
              onMouseEnter={e => { e.currentTarget.style.background = "var(--danger-bg)"; e.currentTarget.style.color = "var(--danger-solid)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "var(--bg-primary)"; e.currentTarget.style.color = "var(--text-muted)"; }}
            >
              <CloseIcon />
            </button>
          </div>
        </div>

        {/* Details */}
        <div style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Role */}
          {event.role && event.role !== "Interview" && (
            <DetailRow icon={<BriefcaseIcon size={15} />} label="Role" value={event.role} />
          )}

          {/* Date */}
          <DetailRow
            icon={<CalIcon size={15} />}
            label="Date"
            value={format(parseISO(event.rawDate), "EEEE, MMMM d, yyyy")}
          />

          {/* Time */}
          <DetailRow
            icon={<ClockIcon size={15} />}
            label="Time"
            value={`${event.startTime}${event.endTime ? " – " + event.endTime : ""} IST`}
          />

          {/* Meet link */}
          {event.meetLink && (
            <DetailRow
              icon={<LinkIcon size={15} />}
              label="Meeting Link"
              value={
                <a
                  href={event.meetLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "var(--accent-primary)", fontWeight: 600, fontSize: 13, wordBreak: "break-all" }}
                >
                  {event.meetLink.replace(/^https?:\/\//, "")}
                </a>
              }
            />
          )}

          {/* Description */}
          {event.description && (
            <div style={{
              background: "var(--bg-primary)",
              border: "1.5px solid var(--border-color)",
              borderRadius: "var(--radius-lg)",
              padding: "12px 14px",
              fontSize: 12.5,
              color: "var(--text-secondary)",
              lineHeight: 1.6,
              fontWeight: 500,
            }}>
              {event.description}
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div style={{
          padding: "14px 20px",
          borderTop: "1px solid var(--border-color)",
          display: "flex",
          gap: 10,
        }}>
          {event.meetLink && (
            <a
              href={event.meetLink}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                flex: 1,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                padding: "10px 16px",
                background: `linear-gradient(135deg, ${color}, ${color}cc)`,
                color: "#fff",
                borderRadius: "var(--radius-md)",
                fontSize: 13, fontWeight: 700,
                textDecoration: "none",
                border: "none",
                cursor: "pointer",
                transition: "opacity 0.2s, transform 0.15s",
              }}
              onMouseEnter={e => e.currentTarget.style.opacity = "0.88"}
              onMouseLeave={e => e.currentTarget.style.opacity = "1"}
            >
              <LinkIcon size={13} />
              Join Meeting
            </a>
          )}

          {event.htmlLink && (
            <a
              href={event.htmlLink.includes('?') ? event.htmlLink + '&authuser=0' : event.htmlLink + '?authuser=0'}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                flex: event.meetLink ? "0 0 auto" : 1,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                padding: "10px 16px",
                background: "var(--accent-soft)",
                color: "var(--accent-primary)",
                borderRadius: "var(--radius-md)",
                fontSize: 13, fontWeight: 700,
                textDecoration: "none",
                border: "1.5px solid transparent",
                cursor: "pointer",
                transition: "background 0.2s, color 0.2s",
              }}
              onMouseEnter={e => { e.currentTarget.style.background = "var(--accent-primary)"; e.currentTarget.style.color = "#fff"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "var(--accent-soft)"; e.currentTarget.style.color = "var(--accent-primary)"; }}
            >
              <CalIcon size={13} />
              Open in Google Calendar
            </a>
          )}


        </div>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes popIn {
          from { opacity: 0; transform: translate(-50%, -48%) scale(0.94) }
          to   { opacity: 1; transform: translate(-50%, -50%) scale(1) }
        }
      `}</style>
    </>
  );
}

function DetailRow({ icon, label, value }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
      <div style={{
        width: 30, height: 30,
        borderRadius: "var(--radius-sm)",
        background: "var(--accent-soft)",
        color: "var(--accent-primary)",
        display: "grid", placeItems: "center",
        flexShrink: 0,
      }}>
        {icon}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 2, paddingTop: 2 }}>
        <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--text-muted)" }}>
          {label}
        </span>
        <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text-primary)" }}>
          {value}
        </span>
      </div>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────
export default function UpcomingEvents() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [fetchError, setFetchError] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState(null);

  useEffect(() => {
    loadEvents();
  }, []);

  // Re-fetch instantly when backend pushes a calendar-updated SSE event
  useSSE({ "calendar-updated": () => loadEvents() });

  // Close on Escape key
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") setSelectedEvent(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function loadEvents() {
    setLoading(true);
    try {
      setIsConnected(true);
      const start = startOfDay(new Date());
      const end = addDays(start, 30);
      const fetched = await calendarService.getEvents(start, end);

      const upcoming = fetched
        .filter((ev) => isAfter(parseISO(ev.date), startOfDay(new Date())))
        .sort((a, b) => new Date(a.date) - new Date(b.date))
        .slice(0, 5)
        .map((ev) => {
          const parsed = parseISO(ev.date);
          return {
            id:          ev._id,
            summary:     ev.summary    || "Untitled Event",
            company:     ev.company    || ev.summary || "",
            role:        ev.role       || "",
            type:        getEventType(ev.summary),
            rawDate:     ev.date,
            date:        ev.startTime
              ? format(parsed, "MMM d") + ", " + ev.startTime
              : format(parsed, "MMM d"),
            startTime:   ev.startTime  || "",
            endTime:     ev.endTime    || "",
            description: ev.description || "",
            logoColor:   getLogoColor(ev.summary),
            logoLetter:  getCompanyInitial(ev.company || ev.summary),
            iconType:    getIconType(ev.summary),
            htmlLink:    ev.eventLink  || "",
            meetLink:    ev.meetLink   || "",
          };
        });

      setEvents(upcoming);
    } catch (err) {
      console.error("UpcomingEvents fetch error:", err);
      setFetchError(true);
    } finally {
      setLoading(false);
    }
  }

  if (!loading && !isConnected) {
    return (
      <div className="card event-card">
        <h3>Upcoming Events</h3>
        <div style={{ padding: "1.5rem 0", textAlign: "center", color: "#94a3b8", fontSize: "0.85rem" }}>
          No events found
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="card event-card">
        <h3>Upcoming Events</h3>
        <div style={{ padding: "1.5rem 0", textAlign: "center", color: "#94a3b8", fontSize: "0.85rem" }}>
          Loading events...
        </div>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="card event-card">
        <h3>Upcoming Events</h3>
        <div style={{ padding: "1.5rem 0", textAlign: "center", color: "#f87171", fontSize: "0.85rem" }}>
          Could not load events.
        </div>
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="card event-card">
        <h3>Upcoming Events</h3>
        <div style={{ padding: "1.5rem 0", textAlign: "center", color: "#94a3b8", fontSize: "0.85rem" }}>
          No upcoming events in the next 30 days 🎉
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="card event-card">
        <h3>Upcoming Events</h3>
        <div className="event-list">
          {events.map((event) => {
            const color = getLogoColor(event.summary);
            return (
              <div
                key={event.id}
                className="event-row"
                style={{ cursor: "pointer", position: "relative" }}
                onClick={() => setSelectedEvent(event)}
              >
                {/* Left: Logo + Name */}
                <div className="event-left">
                  <div style={{
                    width: 32, height: 32,
                    borderRadius: "var(--radius-md)",
                    background: color + "20",
                    color: color,
                    display: "grid", placeItems: "center",
                    flexShrink: 0,
                    fontSize: 13, fontWeight: 800,
                    border: `1.5px solid ${color}30`,
                  }}>
                    {event.logoLetter}
                  </div>
                  <span className="event-company" title={event.summary}>
                    {event.summary.length > 20 ? event.summary.slice(0, 20) + "…" : event.summary}
                  </span>
                </div>

                {/* Middle: Type */}
                <div className="event-type">
                  {event.iconType === "user" ? <UserIcon /> : null}
                  <span>{event.type}</span>
                </div>

                {/* Right: Date */}
                <div className="event-date">{event.date}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Detail Card Modal */}
      {selectedEvent && (
        <EventDetailCard
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
          onDelete={async () => {
            try {
              await deleteCalendarEvent(selectedEvent.id);
              // Remove from list
              setEvents(prev => prev.filter(ev => ev.id !== selectedEvent.id));
              // Close modal
              setSelectedEvent(null);
              // Reload CalendarWidget by dispatching a custom event
              window.dispatchEvent(new CustomEvent("calendar-event-deleted"));
            } catch (err) {
              console.error("Failed to delete event", err);
            }
          }}
        />
      )}
    </>
  );
}