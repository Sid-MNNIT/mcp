import { useEffect } from "react";
import { triggerEmailSync } from "../utils/api.js";

const HEARTBEAT_MS = 5 * 60 * 1000; // while the tab is open, ask every 5 minutes
const MIN_GAP_MS = 60 * 1000;       // this tab never asks more than once a minute

/**
 * Keeps emails fresh without the user pressing Sync.
 *
 * It only ASKS the backend to sync: when the app opens, when the tab becomes
 * visible again, and every 5 minutes while the tab is visible. The backend
 * decides if a sync is really needed (it skips users synced in the last 5 min).
 *
 * @param {boolean} enabled  false until the user is logged in
 */
export function useEmailAutoSync(enabled) {
  useEffect(() => {
    if (!enabled) return;

    let lastAsked = 0;

    const askForSync = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastAsked < MIN_GAP_MS) return;

      lastAsked = Date.now();
      triggerEmailSync("auto").catch((err) =>
        console.warn("Email sync request failed", err)
      );
    };

    askForSync(); // app just opened
    const timer = setInterval(askForSync, HEARTBEAT_MS);
    document.addEventListener("visibilitychange", askForSync);

    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", askForSync);
    };
  }, [enabled]);
}
