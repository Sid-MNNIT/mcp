import { useState, useEffect } from "react";
import { getCurrentUser, startGmailSync, getGmailStatus, getEmailStats, getMyResume } from "../utils/api";
import "../styles/dashboard.css";

import TopHeader from "../components/layout/TopHeader";
import Sidebar from "../components/layout/Sidebar";

import StatusCard from "../components/dashboard/StatusCard";
import ResumePolishCard from "../components/dashboard/ResumePolishCard";
import RecruiterActivity from "../components/dashboard/RecruiterActivity";
import UpcomingEvents from "../components/dashboard/UpcomingEvents";
import CalendarWidget from "../components/dashboard/CalendarWidget";

// Cache keys — kept together so they're easy to invalidate elsewhere.
const K_GMAIL = "dashboard:gmail";
const K_STATS = "dashboard:emailStats";
const K_CAL = "dashboard:calendar";
const K_RESUME = "dashboard:resume";

// Initial state factories read from the cache synchronously.
// If a cached value exists, we render with it and skip the "Checking…" flash.
const initGmail = () =>
  getCached(K_GMAIL) || {
    loading: true,
    isConnected: false,
    email: null,
    timestamp: "Not connected",
<<<<<<< HEAD
  });
<<<<<<< HEAD
  const [emailStats, setEmailStats] = useState({ interviews: 0, rejections: 0, assessments: 0 });
=======
=======
  };
>>>>>>> 3ee21c3c (Added Deploy Files)

const initStats = () =>
  getCached(K_STATS) || {
    loading: true,
    interviews: 0,
    rejections: 0,
    assessments: 0,
  };

const initCal = () =>
  getCached(K_CAL) || {
    loading: true,
    isConnected: false,
    calendarEmail: null,
  };

<<<<<<< HEAD
>>>>>>> a8c47529 (Final working)
  const [resumeData, setResumeData] = useState(null);
=======
export default function Dashboard() {
  // User comes from global auth context — no re-fetch on navigation.
  const { user } = useAuth();

  const [gmail, setGmail] = useState(initGmail);
  const [emailStats, setEmailStats] = useState(initStats);
  const [calendar, setCalendar] = useState(initCal);
  const [resumeData, setResumeData] = useState(() => getCached(K_RESUME) || null);
  const [resumeLoading, setResumeLoading] = useState(
    () => getCached(K_RESUME) == null
  );
>>>>>>> 3ee21c3c (Added Deploy Files)

  useEffect(() => {
    let isMounted = true;

<<<<<<< HEAD
    const loadDashboard = async () => {
      try {
<<<<<<< HEAD
        const userRes = await getCurrentUser();
        const gmailRes = await getGmailStatus();
        const statsRes = await getEmailStats();
        const resumeRes = await getMyResume();

        setUser(userRes.user);
        setEmailStats(statsRes);
        setResumeData(resumeRes);
=======
        const [userRes, gmailRes, statsRes, calRes, resumeRes] =
          await Promise.all([
            getCurrentUser(),
            getGmailStatus(),
            getEmailStats(),
            getCalendarConnectionStatus(),
            getMyResume(),
          ]);

        if (!isMounted) return;

        setUser(userRes?.user || null);
        setEmailStats(statsRes || { interviews: 0, rejections: 0, assessments: 0 });

        setCalendar(
          calRes || { isConnected: false, calendarEmail: null }
        );

        setResumeData(resumeRes || null);
>>>>>>> a8c47529 (Final working)

        setGmail({
          isConnected: gmailRes?.connected || false,
          email: gmailRes?.gmailEmail || null,
          timestamp: gmailRes?.connected
            ? `Synced ${new Date(gmailRes.lastSync).toLocaleString()}`
=======
    // Every source refreshes in parallel in the background.
    // The UI already shows cached values (if any); results just flow in.
    getGmailStatus()
      .then((r) => {
        if (!isMounted) return;
        const next = {
          loading: false,
          isConnected: r?.connected || false,
          email: r?.gmailEmail || null,
          timestamp: r?.connected
            ? `Synced ${new Date(r.lastSync).toLocaleString()}`
>>>>>>> 3ee21c3c (Added Deploy Files)
            : "Not connected",
        };
        setCached(K_GMAIL, next);
        setGmail(next);
      })
      .catch(() => isMounted && setGmail((s) => ({ ...s, loading: false })));

    getEmailStats()
      .then((r) => {
        if (!isMounted) return;
        const next = {
          loading: false,
          interviews: r?.interviews ?? 0,
          rejections: r?.rejections ?? 0,
          assessments: r?.assessments ?? 0,
        };
        setCached(K_STATS, next);
        setEmailStats(next);
      })
      .catch(() =>
        isMounted && setEmailStats((s) => ({ ...s, loading: false }))
      );

    getCalendarConnectionStatus()
      .then((r) => {
        if (!isMounted) return;
        const next = {
          loading: false,
          isConnected: r?.isConnected || false,
          calendarEmail: r?.calendarEmail || null,
        };
        setCached(K_CAL, next);
        setCalendar(next);
      })
      .catch(() =>
        isMounted && setCalendar((s) => ({ ...s, loading: false }))
      );

    getMyResume()
      .then((r) => {
        if (!isMounted) return;
        setCached(K_RESUME, r || null);
        setResumeData(r || null);
        setResumeLoading(false);
      })
      .catch(() => {
        if (!isMounted) return;
        setResumeData(null);
        setResumeLoading(false);
      });

    // Clean OAuth redirect params
    const params = new URLSearchParams(window.location.search);
    if (
      params.get("calendar_connected") === "true" ||
      params.get("calendar_error") === "true"
    ) {
      window.history.replaceState({}, "", "/dashboard");
    }

    return () => {
      isMounted = false;
    };
  }, []);

<<<<<<< HEAD
  const hasResume = resumeData?.data?.hasResume ?? false;
  const resumeTimestamp = hasResume && resumeData?.data?.resume?.uploadedAt
    ? `Updated ${new Date(resumeData.data.resume.uploadedAt).toLocaleString()}`
=======
  // Resume handling (clean + safe)
  const resume = resumeData?.data?.resume;
  const hasResume = !!resume;

  const resumeTimestamp = resume?.uploadedAt
    ? `Updated ${new Date(resume.uploadedAt).toLocaleString()}`
>>>>>>> a8c47529 (Final working)
    : "No resume found";

  return (
    <div className="dashboard-shell">
      <Sidebar />

      <main className="dashboard-root">
        <TopHeader fullName={user?.fullname || "User"} />

        {/* ── Status Row ── */}
        <div className="dashboard-status-grid">
          <StatusCard
            type="resume"
            title="Resume"
            statusText={
              resumeLoading
                ? "Checking…"
                : hasResume
                ? "Parsed & Ready"
                : "Not Uploaded"
            }
            lastUpdated={resumeLoading ? "Loading…" : resumeTimestamp}
            state={resumeLoading ? "success" : hasResume ? "success" : "error"}
          />

          <StatusCard
            type="calendar"
            title="Google Calendar"
            statusText={
              calendar.loading
                ? "Checking…"
                : calendar.isConnected
                ? "Connected"
                : "Not Connected"
            }
            lastUpdated={
              calendar.loading
                ? "Loading…"
                : calendar.isConnected
                ? calendar.calendarEmail
                  ? `Connected as ${calendar.calendarEmail}`
                  : "Calendar syncing active"
                : "No calendar connected"
            }
            state={
              calendar.loading
                ? "success"
                : calendar.isConnected
                ? "success"
                : "error"
            }
            onClick={
              !calendar.loading && !calendar.isConnected
                ? async () => {
                    const url = await getCalendarAuthUrl();
                    window.location.href = url;
                  }
                : undefined
            }
          />

          <StatusCard
            type="gmail"
            title="Gmail"
            statusText={
              gmail.loading
                ? "Checking…"
                : gmail.isConnected
                ? "Connected"
                : "Not Connected"
            }
            lastUpdated={
              gmail.loading
                ? "Loading…"
                : gmail.isConnected && gmail.email
                ? `Connected as ${gmail.email}`
                : gmail.timestamp
            }
            state={
              gmail.loading
                ? "success"
                : gmail.isConnected
                ? "success"
                : "error"
            }
            onClick={
              !gmail.loading && !gmail.isConnected ? startGmailSync : undefined
            }
          />
        </div>

        {/* ── Main Grid ── */}
        <div className="dashboard-main-grid">
          <ResumePolishCard resumeData={resumeData} />
          <RecruiterActivity
            interviews={emailStats.interviews}
            rejections={emailStats.rejections}
            assessments={emailStats.assessments}
          />
        </div>

        {/* ── Lower Grid ── */}
        <div className="dashboard-lower-grid">
          <CalendarWidget />
          <div className="lower-right-col">
            <UpcomingEvents />
          </div>
        </div>
      </main>
    </div>
  );
}
