import { useState, useEffect } from "react";
import {
  addMonths,
  subMonths,
  addYears,
  subYears,
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  isSameMonth,
  isSameDay,
  parseISO,
} from "date-fns";
import { calendarService } from "../../services/calendar.service";
import { useSSE } from "../../hooks/useSSE";

export default function CalendarWidget() {
  const [view, setView] = useState("day");
  const [activeDate, setActiveDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(null);
  const [events, setEvents] = useState({});
  const [isConnected, setIsConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [syncedOk, setSyncedOk] = useState(false);
  const [googleConnected, setGoogleConnected] = useState(false);

  // Check if calendar is connected on mount
  useEffect(() => {
    checkConnection();
  }, []);

  // Fetch events when month changes
  useEffect(() => {
    if (isConnected && view === "day") {
      fetchEventsForMonth();
    }
  }, [activeDate, isConnected, view]);

  // Re-fetch when an event is deleted from UpcomingEvents
  useEffect(() => {
    const handler = () => fetchEventsForMonth();
    window.addEventListener("calendar-event-deleted", handler);
    return () => window.removeEventListener("calendar-event-deleted", handler);
  }, [activeDate]);

  // Re-fetch instantly when backend pushes a calendar-updated SSE event
  useSSE({ "calendar-updated": () => fetchEventsForMonth() });

  // Check for OAuth callback success
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('calendar_connected') === 'true') {
      setIsConnected(true);
      setError(null);
      window.history.replaceState({}, '', window.location.pathname);
    }
    if (params.get('calendar_error') === 'true') {
      setError('Failed to connect calendar. Please try again.');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const checkConnection = async () => {
    // Events come from MongoDB and are always available.
    // We still check Google Calendar connection status to show the
    // "connect" nudge in the footer, but we never block showing events.
    setIsConnected(true);
    try {
      const connected = await calendarService.getConnectionStatus();
      setGoogleConnected(connected);
    } catch (err) {
      setGoogleConnected(false);
    }
  };

  const fetchEventsForMonth = async () => {
    setLoading(true);
    setError(null);
    try {
      const monthStart = startOfMonth(activeDate);
      const monthEnd = endOfMonth(activeDate);
      const calendarStart = startOfWeek(monthStart);
      const calendarEnd = endOfWeek(monthEnd);
      const fetchedEvents = await calendarService.getEvents(calendarStart, calendarEnd);

      // Backend now returns MongoDB CalendarEvent docs, not raw Google API objects.
      // Shape: { _id, googleEventId, summary, date, startTime, endTime, meetLink, eventLink, company, ... }
      const eventsByDate = {};
      fetchedEvents.forEach(event => {
        // date is an ISO string from MongoDB
        const dateKey = format(parseISO(event.date), "yyyy-MM-dd");
        if (!eventsByDate[dateKey]) eventsByDate[dateKey] = [];
        eventsByDate[dateKey].push({
          id:          event._id,            // use MongoDB _id for delete operations
          googleEventId: event.googleEventId || null,
          summary:     event.summary,
          description: event.description || "",
          company:     event.company     || "",
          time:        event.startTime   || "All day",
          color:       "#6366f1",
          htmlLink:    event.eventLink   || "",
          meetLink:    event.meetLink    || "",
        });
      });

      setEvents(eventsByDate);
      setSyncedOk(true);
    } catch (err) {
      console.error('Failed to fetch events:', err);
      setSyncedOk(false);
      setError(err.message);
      if (err.message.includes('authorization') || err.message.includes('reconnect')) {
        setIsConnected(false);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleConnectCalendar = async () => {
    setConnecting(true);
    setError(null);
    try {
      const authUrl = await calendarService.getCalendarAuthUrl();
      window.location.href = authUrl;
    } catch (err) {
      setError('Failed to connect calendar. ' + err.message);
      setConnecting(false);
    }
  };

  const handleDisconnectCalendar = async () => {
    if (!confirm('Are you sure you want to disconnect your Google Calendar?')) return;
    try {
      await calendarService.disconnectCalendar();
      setIsConnected(false);
      setEvents({});
      setError(null);
    } catch (err) {
      setError('Failed to disconnect calendar. Please try again.');
    }
  };

  const handlePrev = () => {
    if (view === "day") setActiveDate(subMonths(activeDate, 1));
    if (view === "month") setActiveDate(subYears(activeDate, 1));
    if (view === "year") setActiveDate(subYears(activeDate, 12));
  };

  const handleNext = () => {
    if (view === "day") setActiveDate(addMonths(activeDate, 1));
    if (view === "month") setActiveDate(addYears(activeDate, 1));
    if (view === "year") setActiveDate(addYears(activeDate, 12));
  };

  const handleTitleClick = () => {
    if (view === "day") setView("month");
    else if (view === "month") setView("year");
  };

  const goToToday = () => {
    setActiveDate(new Date());
    setView("day");
  };

  const getEventsForDate = (date) => {
    const dateKey = format(date, "yyyy-MM-dd");
    return events[dateKey] || [];
  };

  const getEventColor = (colorId) => {
    const colors = {
      '1': '#a4bdfc', '2': '#7ae7bf', '3': '#dbadff', '4': '#ff887c',
      '5': '#fbd75b', '6': '#ffb878', '7': '#46d6db', '8': '#e1e1e1',
      '9': '#5484ed', '10': '#51b749', '11': '#dc2127'
    };
    return colors[colorId] || '#6366f1';
  };

  const renderDays = () => {
    const monthStart = startOfMonth(activeDate);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart);
    const endDate = endOfWeek(monthEnd);

    const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const gridRows = [];
    let day = startDate;

    while (day <= endDate) {
      const dayCells = [];
      for (let i = 0; i < 7; i++) {
        const currentDay = day;
        const dayEvents = getEventsForDate(currentDay);
        const hasEvents = dayEvents.length > 0;
        const firstEvent = dayEvents[0];

        dayCells.push(
          <div
            key={currentDay.toString()}
            className={[
              "cal-cell",
              !isSameMonth(currentDay, monthStart) ? "cal-cell--muted" : "",
              isSameDay(currentDay, new Date()) ? "cal-cell--today" : "",
              selectedDate && isSameDay(currentDay, selectedDate) ? "cal-cell--selected" : "",
              hasEvents ? "cal-cell--event" : "",
            ].filter(Boolean).join(" ")}
            onClick={() => setSelectedDate(currentDay)}
          >
            <span className="cal-cell__num">{format(currentDay, "d")}</span>
            {hasEvents && (
              <span className="cal-cell__dot" style={{ background: firstEvent.color }} />
            )}
            {hasEvents && (
              <div className="cal-tooltip">
                {dayEvents.map((ev, idx) => (
                  <div key={idx} className="cal-tooltip__row">
                    <span className="cal-tooltip__dot" style={{ background: ev.color }} />
                    <div>
                      <div className="cal-tooltip__company">{ev.summary}</div>
                      <div className="cal-tooltip__meta">{ev.time}</div>
                      {ev.description && (
                        <div className="tooltip-description" title={ev.description}>
                          {ev.description}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
        day = addDays(day, 1);
      }
      gridRows.push(
        <div className="cal-row" key={day.toString()}>
          {dayCells}
        </div>
      );
    }

    return (
      <div className="cal-grid-wrapper">
        <div className="cal-weekdays">
          {weekdays.map((weekday) => (
            <div key={weekday} className="cal-weekday">{weekday}</div>
          ))}
        </div>
        <div className="cal-grid">{gridRows}</div>
      </div>
    );
  };

  const renderMonths = () => {
    const months = Array.from({ length: 12 }, (_, i) => format(new Date(2020, i, 1), "MMM"));
    return (
      <div className="cal-picker-grid">
        {months.map((m, i) => (
          <button
            key={m}
            className={`cal-picker-cell${i === activeDate.getMonth() ? " active" : ""}`}
            onClick={() => {
              setActiveDate(new Date(activeDate.getFullYear(), i, 1));
              setView("day");
            }}
          >
            {m}
          </button>
        ))}
      </div>
    );
  };

  const renderYears = () => {
    const startYear = Math.floor(activeDate.getFullYear() / 12) * 12;
    const years = Array.from({ length: 12 }, (_, i) => startYear + i);
    return (
      <div className="cal-picker-grid">
        {years.map((y) => (
          <button
            key={y}
            className={`cal-picker-cell${y === activeDate.getFullYear() ? " active" : ""}`}
            onClick={() => {
              setActiveDate(new Date(y, activeDate.getMonth(), 1));
              setView("month");
            }}
          >
            {y}
          </button>
        ))}
      </div>
    );
  };

  // Calendar always renders — events come from MongoDB regardless of Google connection

  return (
    <div className="cal-card">
      <div className="cal-header">
        <div className="cal-header__left">
          <div className="cal-header__icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2"/>
              <path d="M3 10H21" stroke="currentColor" strokeWidth="2"/>
              <path d="M8 2V6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              <path d="M16 2V6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </div>
          <button className="cal-title" onClick={handleTitleClick}>
            {view === "day" && format(activeDate, "MMMM yyyy")}
            {view === "month" && format(activeDate, "yyyy")}
            {view === "year" && `${Math.floor(activeDate.getFullYear() / 12) * 12} – ${Math.floor(activeDate.getFullYear() / 12) * 12 + 11}`}
          </button>
          <button onClick={goToToday} className="cal-today-btn">Today</button>
        </div>
        <div className="cal-header__nav">
          <button onClick={handlePrev} className="cal-nav-btn" disabled={loading}>‹</button>
          <button onClick={handleNext} className="cal-nav-btn" disabled={loading}>›</button>
        </div>
      </div>

      {loading && <div className="calendar-loading">Loading events...</div>}
      {error && <div className="calendar-error">{error}</div>}

      {view === "day" && renderDays()}
      {view === "month" && renderMonths()}
      {view === "year" && renderYears()}

      {!loading && (
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginTop: "14px",
          paddingTop: "12px",
          borderTop: "1px solid var(--border-color)"
        }}>
          {googleConnected ? (
            <>
              <span style={{
                fontSize: "11px",
                color: "var(--text-muted)",
                display: "flex",
                alignItems: "center",
                gap: "6px",
                fontWeight: 500
              }}>
                <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                  <circle cx="6" cy="6" r="6" fill="#10b981"/>
                </svg>
                Google Calendar connected
              </span>
              <button
                onClick={handleDisconnectCalendar}
                title="Disconnect calendar"
                style={{ fontSize: "11px", color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer", fontWeight: 500 }}
              >
                ⚙️ Disconnect
              </button>
            </>
          ) : (
            <button
              onClick={handleConnectCalendar}
              disabled={connecting}
              style={{ fontSize: "11px", color: "#6366f1", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}
            >
              {connecting ? "Connecting..." : "📅 Connect Google Calendar for phone notifications"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}