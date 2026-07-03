import React, { useState, useRef } from "react";
import { uploadAvatar } from "../../utils/api";
import "../../styles/profile.css";

export default function AvatarModal({ currentAvatar, onClose, onSave }) {
  const [preview, setPreview] = useState(currentAvatar);
  const [file, setFile] = useState(null);
  const [url, setUrl] = useState("");
  const [tab, setTab] = useState("upload"); // "upload" | "url"
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef();

  const handleFileChange = (e) => {
    const selected = e.target.files[0];
    if (!selected) return;
    setFile(selected);
    setPreview(URL.createObjectURL(selected));
    setError("");
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const dropped = e.dataTransfer.files[0];
    if (!dropped) return;
    setFile(dropped);
    setPreview(URL.createObjectURL(dropped));
    setError("");
  };

  const handleSave = async () => {
    setError("");

    if (tab === "upload" && !file) {
      setError("Please select a file.");
      return;
    }
    if (tab === "url" && !url.trim()) {
      setError("Please enter an image URL.");
      return;
    }

    setLoading(true);
    try {
      if (tab === "upload") {
        // uploadAvatar posts the file AND saves avatarUrl to MongoDB in the controller
        const res = await uploadAvatar(file);
        // Normalize the returned relative path to a full URL for display
        const BACKEND_URL =
          import.meta.env.VITE_BACKEND_URL || "http://localhost:5000";
        const fullUrl = res.avatarUrl.startsWith("http")
          ? res.avatarUrl
          : `${BACKEND_URL}${res.avatarUrl}`;
        onSave(fullUrl);
      } else {
        // For URL tab: pass the URL up — Profile.jsx will call updateMyProfile to persist it
        onSave(url.trim());
      }
    } catch (err) {
      console.error(err);
      setError("Upload failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="avatar-modal-content" onClick={(e) => e.stopPropagation()}>

        {/* Preview */}
        <img
          src={preview || "https://cdn-icons-png.flaticon.com/512/149/149071.png"}
          alt="Preview"
          className="avatar-full-preview"
          onError={(e) => { e.target.src = "https://cdn-icons-png.flaticon.com/512/149/149071.png"; }}
        />

        {/* Tabs */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16, justifyContent: "center" }}>
          <button
            onClick={() => setTab("upload")}
            style={{
              padding: "6px 18px", borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: "pointer",
              border: tab === "upload" ? "none" : "1px solid #e5e7eb",
              background: tab === "upload" ? "#2563eb" : "transparent",
              color: tab === "upload" ? "#fff" : "#374151",
            }}
          >
            Upload File
          </button>
          <button
            onClick={() => setTab("url")}
            style={{
              padding: "6px 18px", borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: "pointer",
              border: tab === "url" ? "none" : "1px solid #e5e7eb",
              background: tab === "url" ? "#2563eb" : "transparent",
              color: tab === "url" ? "#fff" : "#374151",
            }}
          >
            Paste URL
          </button>
        </div>

        <div className="avatar-controls">
          {tab === "upload" ? (
            <div
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => inputRef.current.click()}
              style={{
                border: "2px dashed #93c5fd", borderRadius: 12, padding: "24px 16px",
                textAlign: "center", cursor: "pointer", background: "#eff6ff", marginBottom: 12,
                color: "#2563eb", fontSize: 14, fontWeight: 500,
              }}
            >
              {file ? (
                <span>✅ {file.name}</span>
              ) : (
                <span>Drag & drop or <u>click to choose</u> an image<br /><small style={{ color: "#6b7280", fontWeight: 400 }}>JPG, PNG, WEBP — max 5MB</small></span>
              )}
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={handleFileChange}
              />
            </div>
          ) : (
            <input
              type="text"
              className="form-input"
              placeholder="Paste image URL here..."
              value={url}
              onChange={(e) => { setUrl(e.target.value); setPreview(e.target.value); }}
              style={{ marginBottom: 12 }}
            />
          )}

          {error && <p style={{ color: "#ef4444", fontSize: 13, marginBottom: 8, textAlign: "center" }}>{error}</p>}

          <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
            <button className="btn-social" onClick={onClose} disabled={loading}>Cancel</button>
            <button className="btn-primary" onClick={handleSave} disabled={loading}>
              {loading ? "Saving…" : "Set Profile Picture"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
