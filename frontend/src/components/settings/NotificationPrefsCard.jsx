import React, { useState, useEffect } from "react";
import { CalendarCheck, XCircle, PartyPopper, ClipboardList, BarChart3 } from "lucide-react";
import { getNotificationPrefs, updateNotificationPrefs } from "../../utils/api";

const PREFS_CONFIG = [
  {
    key: "interviewAlerts",
    label: "Interview Invites",
    description: "Get notified when an interview is scheduled or confirmed.",
    Icon: CalendarCheck,
    activeColor: "#3b82f6",
    activeBg: "#eff6ff",
  },
  {
    key: "rejectionAlerts",
    label: "Rejection Emails",
    description: "Know when an application hasn't moved forward.",
    Icon: XCircle,
    activeColor: "#ef4444",
    activeBg: "#fef2f2",
  },
  {
    key: "offerAlerts",
    label: "Offer Letters",
    description: "Be alerted when an offer lands in your inbox.",
    Icon: PartyPopper,
    activeColor: "#22c55e",
    activeBg: "#f0fdf4",
  },
  {
    key: "assessmentAlerts",
    label: "Assessments & Tests",
    description: "Get notified about coding tests or skill assessments.",
    Icon: ClipboardList,
    activeColor: "#f59e0b",
    activeBg: "#fffbeb",
  },
  {
    key: "weeklyDigest",
    label: "Weekly Digest",
    description: "Receive a weekly summary of your job activity.",
    Icon: BarChart3,
    activeColor: "#8b5cf6",
    activeBg: "#f5f3ff",
  },
];

const DEFAULT_PREFS = {
  interviewAlerts: true,
  rejectionAlerts: true,
  offerAlerts: true,
  assessmentAlerts: false,
  weeklyDigest: false,
};

export default function NotificationPrefsCard() {
  const [prefs, setPrefs] = useState(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getNotificationPrefs()
      .then((data) => setPrefs({ ...DEFAULT_PREFS, ...data.prefs }))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleToggle = (key) => {
    setPrefs((prev) => ({ ...prev, [key]: !prev[key] }));
    setSaved(false);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const data = await updateNotificationPrefs(prefs);
      setPrefs({ ...DEFAULT_PREFS, ...data.prefs });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      console.error(err);
      alert("Failed to save preferences. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        background: "var(--bg-card, #fff)",
        border: "1px solid var(--border-color, #e5e7eb)",
        borderRadius: 12,
        padding: "24px 28px",
        boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
        marginTop: 20,
      }}
    >
      <h2 style={{ margin: "0 0 4px", fontSize: 17, fontWeight: 700 }}>
        Notification Preferences
      </h2>
      <p style={{ margin: "0 0 24px", color: "var(--text-secondary, #6b7280)", fontSize: 14 }}>
        Choose which email types trigger alerts inside Jobsy.
      </p>

      {loading ? (
        <p style={{ color: "var(--text-secondary, #6b7280)", fontSize: 14 }}>Loading preferences…</p>
      ) : (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {PREFS_CONFIG.map(({ key, label, description, Icon, activeColor, activeBg }, idx) => (
              <div
                key={key}
                onClick={() => handleToggle(key)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "14px 16px",
                  borderRadius: 10,
                  cursor: "pointer",
                  background: prefs[key] ? activeBg : "transparent",
                  border: `1px solid ${prefs[key] ? activeColor + "33" : "var(--border-color, #e5e7eb)"}`,
                  transition: "all 0.15s ease",
                  userSelect: "none",
                  marginBottom: idx < PREFS_CONFIG.length - 1 ? 8 : 0,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  {/* Icon badge */}
                  <div style={{
                    width: 36,
                    height: 36,
                    borderRadius: 9,
                    background: prefs[key] ? activeColor + "18" : "var(--bg-primary, #f3f4f6)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    transition: "background 0.15s ease",
                  }}>
                    <Icon
                      size={17}
                      strokeWidth={2}
                      color={prefs[key] ? activeColor : "#9ca3af"}
                      style={{ transition: "color 0.15s ease" }}
                    />
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14, color: "var(--text-primary, #111827)" }}>
                      {label}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-secondary, #6b7280)", marginTop: 2 }}>
                      {description}
                    </div>
                  </div>
                </div>

                {/* Toggle pill */}
                <div
                  style={{
                    width: 44,
                    height: 24,
                    borderRadius: 12,
                    background: prefs[key] ? "var(--accent-primary, #3b82f6)" : "#d1d5db",
                    position: "relative",
                    flexShrink: 0,
                    transition: "background 0.2s ease",
                  }}
                >
                  <div
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: "50%",
                      background: "#fff",
                      position: "absolute",
                      top: 3,
                      left: prefs[key] ? 23 : 3,
                      transition: "left 0.2s ease",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 20, display: "flex", alignItems: "center", gap: 12 }}>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                padding: "9px 22px",
                background: saved ? "#22c55e" : "var(--accent-primary, #3b82f6)",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                fontWeight: 600,
                fontSize: 14,
                cursor: saving ? "not-allowed" : "pointer",
                opacity: saving ? 0.75 : 1,
                transition: "background 0.2s ease",
              }}
            >
              {saving ? "Saving…" : saved ? "✓ Saved!" : "Save Preferences"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
