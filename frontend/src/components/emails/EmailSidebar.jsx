import React from "react";
import {
  PenLine,
  Inbox,
  SendHorizonal,
  Star,
  RefreshCw,
} from "lucide-react";

export default function EmailSidebar({
  onComposeClick,
  onShowInbox,
  onShowSent,
  onShowStarred,
  onSync,
  isSyncing,
}) {
  return (
    <div className="email-sidebar">

      {/* ── Actions ── */}
      <div className="sidebar-actions">

        <button className="sidebar-btn primary" onClick={onComposeClick}>
          <PenLine size={17} strokeWidth={2.5} />
          <span>Compose</span>
        </button>

        <button className="sidebar-btn" onClick={onShowInbox}>
          <Inbox size={17} strokeWidth={2} />
          <span>Inbox</span>
        </button>

        <button className="sidebar-btn" onClick={onShowSent}>
          <SendHorizonal size={17} strokeWidth={2} />
          <span>Sent</span>
        </button>

        <button className="sidebar-btn" onClick={onShowStarred}>
          <Star size={17} strokeWidth={2} />
          <span>Starred</span>
        </button>

      </div>

      {/* ── Footer / Sync ── */}
      <div className="sidebar-footer">
        <div className="sync-card">
          <button
            className={`sidebar-btn sync ${isSyncing ? "syncing" : ""}`}
            onClick={onSync}
            disabled={isSyncing}
          >
            <RefreshCw
              size={15}
              strokeWidth={2.5}
              className={isSyncing ? "spin-anim" : ""}
            />
            <span>{isSyncing ? "Syncing…" : "Sync Email"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
