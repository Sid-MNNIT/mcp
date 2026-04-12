import { useState, useEffect } from "react";
<<<<<<< HEAD
import { getCurrentUser, startGmailSync, getGmailStatus, getEmailStats, getMyResume } from "../utils/api";
=======
import {
  getCurrentUser,
  startGmailSync,
  getGmailStatus,
  getEmailStats,
  getMyResume,
  getCalendarAuthUrl,
  getCalendarConnectionStatus,
} from "../utils/api";

>>>>>>> a8c47529 (Final working)
import "../styles/dashboard.css";

import TopHeader from "../components/layout/TopHeader";
import Sidebar from "../components/layout/Sidebar";

import StatusCard from "../components/dashboard/StatusCard";
import ResumePolishCard from "../components/dashboard/ResumePolishCard";
import RecruiterActivity from "../components/dashboard/RecruiterActivity";
import UpcomingEvents from "../components/dashboard/UpcomingEvents";
import CalendarWidget from "../components/dashboard/CalendarWidget";

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const [gmail, setGmail] = useState({
    isConnected: false,
    email: null,
    timestamp: "Not connected",
  });
<<<<<<< HEAD
  const [emailStats, setEmailStats] = useState({ interviews: 0, rejections: 0, assessments: 0 });
=======

  const [emailStats, setEmailStats] = useState({
    interviews: 0,
    rejections: 0,
    assessments: 0,
  });

  const [calendar, setCalendar] = useState({
    isConnected: false,
    calendarEmail: null,
  });

>>>>>>> a8c47529 (Final working)
  const [resumeData, setResumeData] = useState(null);

  useEffect(() => {
    let isMounted = true;

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
            : "Not connected",
        });

        // Clean OAuth redirect params
        const params = new URLSearchParams(window.location.search);
        if (
          params.get("calendar_connected") === "true" ||
          params.get("calendar_error") === "true"
        ) {
          window.history.replaceState({}, "", "/dashboard");
        }
      } catch (err) {
        console.error("Dashboard load error:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadDashboard();

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

  if (loading) {
    return <div className="dashboard-loading">Loading dashboard...</div>;
  }

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
            statusText={hasResume ? "Parsed & Ready" : "Not Uploaded"}
            lastUpdated={resumeTimestamp}
            state={hasResume ? "success" : "error"}
          />

          <StatusCard
            type="calendar"
            title="Google Calendar"
            statusText={calendar.isConnected ? "Connected" : "Not Connected"}
            lastUpdated={
              calendar.isConnected
                ? calendar.calendarEmail
                  ? `Connected as ${calendar.calendarEmail}`
                  : "Calendar syncing active"
                : "No calendar connected"
            }
            state={calendar.isConnected ? "success" : "error"}
            onClick={
              !calendar.isConnected
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
            statusText={gmail.isConnected ? "Connected" : "Not Connected"}
            lastUpdated={
              gmail.isConnected && gmail.email
                ? `Connected as ${gmail.email}`
                : gmail.timestamp
            }
            state={gmail.isConnected ? "success" : "error"}
            onClick={!gmail.isConnected ? startGmailSync : undefined}
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