import { useEffect, useRef } from "react";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api";

/**
 * useSSE — connects to /api/sse and calls handlers when named events arrive.
 *
 * @param {Record<string, (data: any) => void>} handlers  e.g. { "calendar-updated": (d) => reload() }
 * @param {boolean} enabled  set false to skip connecting (e.g. user not logged in)
 */
export function useSSE(handlers, enabled = true) {
  const handlersRef = useRef(handlers);
  // Keep ref fresh on every render without restarting the connection
  useEffect(() => { handlersRef.current = handlers; });

  useEffect(() => {
    if (!enabled) return;

    const url = `${API_BASE_URL}/sse`;
    const es = new EventSource(url, { withCredentials: true });

    // Attach a listener for every event name supplied at mount time.
    const eventNames = Object.keys(handlersRef.current);
    eventNames.forEach((name) => {
      es.addEventListener(name, (e) => {
        try {
          const data = JSON.parse(e.data);
          handlersRef.current[name]?.(data);
        } catch {
          handlersRef.current[name]?.(e.data);
        }
      });
    });

    es.onerror = () => {
      // EventSource auto-reconnects; nothing to do here.
    };

    return () => es.close();
  }, [enabled]); // only (re)connect when `enabled` changes
}
