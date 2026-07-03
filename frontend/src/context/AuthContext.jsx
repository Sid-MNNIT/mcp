import { createContext, useContext, useEffect, useState, useCallback } from "react";
import {
  getCurrentUser,
  getGmailStatus,
  getEmailStats,
  getMyResume,
  getCalendarConnectionStatus,
} from "../utils/api";
import { setCached } from "../utils/cache";

const AuthContext = createContext(null);

/**
 * Fire the dashboard fetches in the background as soon as the user is
 * authenticated. Results land in the SWR cache, so by the time the user
 * clicks "Dashboard" the cards render instantly with cached data.
 */
function prefetchDashboard() {
  getGmailStatus()
    .then((r) =>
      setCached("dashboard:gmail", {
        loading: false,
        isConnected: r?.connected || false,
        email: r?.gmailEmail || null,
        timestamp: r?.connected
          ? `Synced ${new Date(r.lastSync).toLocaleString()}`
          : "Not connected",
      })
    )
    .catch(() => {});

  getEmailStats()
    .then((r) =>
      setCached("dashboard:emailStats", {
        loading: false,
        interviews: r?.interviews ?? 0,
        rejections: r?.rejections ?? 0,
        assessments: r?.assessments ?? 0,
      })
    )
    .catch(() => {});

  getCalendarConnectionStatus()
    .then((r) =>
      setCached("dashboard:calendar", {
        loading: false,
        isConnected: r?.isConnected || false,
        calendarEmail: r?.calendarEmail || null,
      })
    )
    .catch(() => {});

  getMyResume()
    .then((r) => setCached("dashboard:resume", r || null))
    .catch(() => {});
}

/**
 * Runs the auth check ONCE at app startup and holds the result globally.
 * Prevents every ProtectedRoute mount from re-hitting /user/me and flashing
 * a "Checking authentication..." blocker on every route change.
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState("loading"); // "loading" | "authenticated" | "unauthenticated"

  const refresh = useCallback(async () => {
    try {
      const res = await getCurrentUser();
      if (res?.success === true) {
        setUser(res.user || null);
        setStatus("authenticated");
        prefetchDashboard();
      } else {
        setUser(null);
        setStatus("unauthenticated");
      }
    } catch {
      setUser(null);
      setStatus("unauthenticated");
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    getCurrentUser()
      .then((res) => {
        if (!mounted) return;
        if (res?.success === true) {
          setUser(res.user || null);
          setStatus("authenticated");
          // Warm the dashboard cache in the background so the first
          // click on "Dashboard" (or any protected page) is instant.
          prefetchDashboard();
        } else {
          setStatus("unauthenticated");
        }
      })
      .catch(() => {
        if (mounted) setStatus("unauthenticated");
      });
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, status, setUser, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
