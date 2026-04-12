import React, { useState, useEffect } from "react";
import Sidebar from "../components/layout/Sidebar";
import TopHeader from "../components/layout/TopHeader";
import {
  getGmailStatus, disconnectGmail, reconnectGmail,
  getCalendarConnectionStatus, getCalendarAuthUrl, disconnectCalendar
} from "../utils/api";
import NotificationPrefsCard from "../components/settings/NotificationPrefsCard";
import { useCurrentUser } from "../hooks/useCurrentUser";
import "../styles/dashboard.css";

export default function Settings() {
  const [gmailStatus, setGmailStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  // Calendar state
  const [calendarStatus, setCalendarStatus] = useState({ isConnected: false, calendarEmail: null });
  const [calendarLoading, setCalendarLoading] = useState(true);
  const [calendarActionLoading, setCalendarActionLoading] = useState(false);
  const [confirmCalendarDisconnect, setConfirmCalendarDisconnect] = useState(false);

  const fullName = useCurrentUser();

  useEffect(() => {
    const load = async () => {
      try {
        const [gmailData, calData] = await Promise.all([
          getGmailStatus(),
          getCalendarConnectionStatus(),
        ]);
        setGmailStatus(gmailData);
        setCalendarStatus(calData);
      } catch (err) {
        console.error("Failed to fetch integration status", err);
      } finally {
        setLoading(false);
        setCalendarLoading(false);
      }
    };
    load();
  }, []);

  const handleDisconnect = async () => {
    try {
      setActionLoading(true);
      await disconnectGmail();
      setGmailStatus({ connected: false, lastSync: null });
      setConfirmDisconnect(false);
    } catch (err) {
      alert("Failed to disconnect Gmail. Please try again.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleConnect = () => {
    reconnectGmail(); // redirects to OAuth
  };

  const handleCalendarConnect = async () => {
    try {
      setCalendarActionLoading(true);
      const authUrl = await getCalendarAuthUrl();
      window.location.href = authUrl;
    } catch (err) {
      alert("Failed to get calendar auth URL. Please try again.");
      setCalendarActionLoading(false);
    }
  };

  const handleCalendarDisconnect = async () => {
    try {
      setCalendarActionLoading(true);
      await disconnectCalendar();
      setCalendarStatus({ isConnected: false, calendarEmail: null });
      setConfirmCalendarDisconnect(false);
    } catch (err) {
      alert("Failed to disconnect Google Calendar. Please try again.");
    } finally {
      setCalendarActionLoading(false);
    }
  };

  return (
    <div className="dashboard-shell">
      <Sidebar />
      <main className="dashboard-root">
        <TopHeader title="Settings" hideGreeting={true} fullName={fullName} />

        <div style={{ maxWidth: 600 }}>

          {/* Gmail Integration Card */}
          <div style={{
            background: "var(--bg-card, #fff)",
            border: "1px solid var(--border-color, #e5e7eb)",
            borderRadius: 12,
            padding: "24px 28px",
            boxShadow: "0 1px 4px rgba(0,0,0,0.06)"
          }}>
            <h2 style={{ margin: "0 0 4px", fontSize: 17, fontWeight: 700 }}>
              Gmail Integration
            </h2>
            <p style={{ margin: "0 0 20px", color: "var(--text-secondary, #6b7280)", fontSize: 14 }}>
              Connect your Gmail account to sync job-related emails into Jobsy.
            </p>

            {loading ? (
              <p style={{ color: "var(--text-secondary, #6b7280)", fontSize: 14 }}>
                Checking connection…
              </p>
            ) : gmailStatus?.connected ? (
              <>
                {/* Connected state */}
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 14px",
                  background: "#f0fdf4",
                  border: "1px solid #bbf7d0",
                  borderRadius: 8,
                  marginBottom: 20
                }}>
                  <span style={{ fontSize: 18 }}>✅</span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14, color: "#166534" }}>
                      Gmail Connected
                    </div>
                    {gmailStatus.gmailEmail && (
                      <div style={{ fontSize: 12, color: "#15803d", marginTop: 2 }}>
                        {gmailStatus.gmailEmail}
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 10 }}>
                  {/* Switch Account = disconnect then reconnect */}
                  <button
                    onClick={handleConnect}
                    style={{
                      padding: "9px 18px",
                      background: "var(--accent-primary, #3b82f6)",
                      color: "#fff",
                      border: "none",
                      borderRadius: 8,
                      fontWeight: 600,
                      fontSize: 14,
                      cursor: "pointer"
                    }}
                  >
                    🔄 Switch Account
                  </button>

                  {!confirmDisconnect ? (
                    <button
                      onClick={() => setConfirmDisconnect(true)}
                      style={{
                        padding: "9px 18px",
                        background: "transparent",
                        color: "#ef4444",
                        border: "1px solid #ef4444",
                        borderRadius: 8,
                        fontWeight: 600,
                        fontSize: 14,
                        cursor: "pointer"
                      }}
                    >
                      Disconnect
                    </button>
                  ) : (
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <span style={{ fontSize: 13, color: "#ef4444" }}>
                        Are you sure?
                      </span>
                      <button
                        onClick={handleDisconnect}
                        disabled={actionLoading}
                        style={{
                          padding: "7px 14px",
                          background: "#ef4444",
                          color: "#fff",
                          border: "none",
                          borderRadius: 7,
                          fontWeight: 600,
                          fontSize: 13,
                          cursor: actionLoading ? "not-allowed" : "pointer",
                          opacity: actionLoading ? 0.7 : 1
                        }}
                      >
                        {actionLoading ? "Disconnecting…" : "Yes, Disconnect"}
                      </button>
                      <button
                        onClick={() => setConfirmDisconnect(false)}
                        style={{
                          padding: "7px 14px",
                          background: "transparent",
                          color: "var(--text-secondary, #6b7280)",
                          border: "1px solid var(--border-color, #e5e7eb)",
                          borderRadius: 7,
                          fontWeight: 600,
                          fontSize: 13,
                          cursor: "pointer"
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                {/* Disconnected state */}
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 14px",
                  background: "#fafafa",
                  border: "1px solid var(--border-color, #e5e7eb)",
                  borderRadius: 8,
                  marginBottom: 20
                }}>
                  <span style={{ fontSize: 18 }}>🔌</span>
                  <div style={{ fontWeight: 600, fontSize: 14, color: "var(--text-secondary, #6b7280)" }}>
                    No Gmail account connected
                  </div>
                </div>

                <button
                  onClick={handleConnect}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "10px 20px",
                    background: "var(--accent-primary, #3b82f6)",
                    color: "#fff",
                    border: "none",
                    borderRadius: 8,
                    fontWeight: 600,
                    fontSize: 14,
                    cursor: "pointer"
                  }}
                >
                  <img
                    src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
                    alt="Google"
                    style={{ width: 18, height: 18, background: "#fff", borderRadius: 3, padding: 1 }}
                  />
                  Connect Gmail
                </button>
              </>
            )}
          </div>
          {/* Google Calendar Integration Card */}
          <div style={{
            background: "var(--bg-card, #fff)",
            border: "1px solid var(--border-color, #e5e7eb)",
            borderRadius: 12,
            padding: "24px 28px",
            marginTop: 20,
            boxShadow: "0 1px 4px rgba(0,0,0,0.06)"
          }}>
            <h2 style={{ margin: "0 0 4px", fontSize: 17, fontWeight: 700 }}>
              Google Calendar Integration
            </h2>
            <p style={{ margin: "0 0 20px", color: "var(--text-secondary, #6b7280)", fontSize: 14 }}>
              Connect your Google Calendar to automatically create interview events from your emails.
            </p>

            {calendarLoading ? (
              <p style={{ color: "var(--text-secondary, #6b7280)", fontSize: 14 }}>Checking connection…</p>
            ) : calendarStatus.isConnected ? (
              <>
                {/* Connected state */}
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 14px",
                  background: "#f0fdf4",
                  border: "1px solid #bbf7d0",
                  borderRadius: 8,
                  marginBottom: 20
                }}>
                  <span style={{ fontSize: 18 }}>📅</span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14, color: "#166534" }}>
                      Google Calendar Connected
                    </div>
                    {calendarStatus.calendarEmail && (
                      <div style={{ fontSize: 12, color: "#4ade80", marginTop: 2 }}>
                        {calendarStatus.calendarEmail}
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 10 }}>
                  <button
                    onClick={handleCalendarConnect}
                    disabled={calendarActionLoading}
                    style={{
                      padding: "9px 18px",
                      background: "var(--accent-primary, #3b82f6)",
                      color: "#fff",
                      border: "none",
                      borderRadius: 8,
                      fontWeight: 600,
                      fontSize: 14,
                      cursor: calendarActionLoading ? "not-allowed" : "pointer",
                      opacity: calendarActionLoading ? 0.7 : 1
                    }}
                  >
                    🔄 Switch Account
                  </button>

                  {!confirmCalendarDisconnect ? (
                    <button
                      onClick={() => setConfirmCalendarDisconnect(true)}
                      style={{
                        padding: "9px 18px",
                        background: "transparent",
                        color: "#ef4444",
                        border: "1px solid #ef4444",
                        borderRadius: 8,
                        fontWeight: 600,
                        fontSize: 14,
                        cursor: "pointer"
                      }}
                    >
                      Disconnect
                    </button>
                  ) : (
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <span style={{ fontSize: 13, color: "#ef4444" }}>Are you sure?</span>
                      <button
                        onClick={handleCalendarDisconnect}
                        disabled={calendarActionLoading}
                        style={{
                          padding: "7px 14px",
                          background: "#ef4444",
                          color: "#fff",
                          border: "none",
                          borderRadius: 7,
                          fontWeight: 600,
                          fontSize: 13,
                          cursor: calendarActionLoading ? "not-allowed" : "pointer",
                          opacity: calendarActionLoading ? 0.7 : 1
                        }}
                      >
                        {calendarActionLoading ? "Disconnecting…" : "Yes, Disconnect"}
                      </button>
                      <button
                        onClick={() => setConfirmCalendarDisconnect(false)}
                        style={{
                          padding: "7px 14px",
                          background: "transparent",
                          color: "var(--text-secondary, #6b7280)",
                          border: "1px solid var(--border-color, #e5e7eb)",
                          borderRadius: 7,
                          fontWeight: 600,
                          fontSize: 13,
                          cursor: "pointer"
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                {/* Disconnected state */}
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 14px",
                  background: "#fafafa",
                  border: "1px solid var(--border-color, #e5e7eb)",
                  borderRadius: 8,
                  marginBottom: 20
                }}>
                  <span style={{ fontSize: 18 }}>🔌</span>
                  <div style={{ fontWeight: 600, fontSize: 14, color: "var(--text-secondary, #6b7280)" }}>
                    No Google Calendar connected
                  </div>
                </div>

                <button
                  onClick={handleCalendarConnect}
                  disabled={calendarActionLoading}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "10px 20px",
                    background: "var(--accent-primary, #3b82f6)",
                    color: "#fff",
                    border: "none",
                    borderRadius: 8,
                    fontWeight: 600,
                    fontSize: 14,
                    cursor: calendarActionLoading ? "not-allowed" : "pointer",
                    opacity: calendarActionLoading ? 0.7 : 1
                  }}
                >
                  <img
                    src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
                    alt="Google"
                    style={{ width: 18, height: 18, background: "#fff", borderRadius: 3, padding: 1 }}
                  />
                  {calendarActionLoading ? "Connecting…" : "Connect Google Calendar"}
                </button>
              </>
            )}
          </div>

          {/* Notification Preferences Card */}
          <NotificationPrefsCard />
        </div>
      </main>
    </div>
  );
}