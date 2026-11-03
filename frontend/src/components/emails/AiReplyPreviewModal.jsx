import React, { useState } from "react";

export default function AiReplyPreviewModal({
  draft,
  originalEmail,
  onClose,
  onSend,
  onEditInCompose
}) {
  const [body, setBody] = useState(draft?.body || "");

  if (!draft || !originalEmail) return null; // 🔒 HARD GUARD

  return (
    <div className="compose-overlay">
      <div className="compose-window">

        {/* HEADER */}
        <div className="compose-header">
          <h3 className="compose-title">✨ AI Reply Preview</h3>
          <button className="icon-btn-close" onClick={onClose}>✕</button>
        </div>

        {/* ORIGINAL EMAIL */}
        <div className="email-preview-original">
          <div className="preview-label">Original Message</div>

          <div className="preview-subject">
            <strong>Subject:</strong> {originalEmail.subject || "(No subject)"}
          </div>

          <div className="preview-body">
            {(originalEmail.body || "")
              .split("\n")
              .filter(Boolean)
              .map((l, i) => (
                <p key={i}>{l}</p>
              ))}
          </div>
        </div>

        {/* AI REPLY */}
        <div className="compose-inputs">
          <div className="preview-label">AI Suggested Reply</div>
          <textarea
            className="compose-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </div>

        {/* FOOTER */}
        <div className="compose-footer">
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>

          <div style={{ display: "flex", gap: "10px" }}>
            <button
              className="btn-secondary"
              onClick={() =>
                onEditInCompose({ ...draft, body })
              }
            >
              Edit in Compose
            </button>

            <button
              className="btn-primary"
              onClick={() =>
                onSend({ ...draft, body })
              }
            >
              Send Email →
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
