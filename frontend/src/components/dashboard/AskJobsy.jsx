import React, { useState, useRef, useEffect } from "react";
import { Sparkles, SendHorizonal } from "lucide-react";

// Calls Node proxy — Node's verifyJWT reads the httpOnly cookie and
// forwards the JWT as Bearer to Python. Frontend never touches the cookie.
const BACKEND_URL =
  import.meta.env.VITE_BACKEND_URL || "http://localhost:5000";
const CHAT_URL = `${BACKEND_URL}/api/ai/chat`;

// Scoped to this browser session. Cleared on logout (TopHeader.jsx).
function getOrCreateConversationId() {
  let id = localStorage.getItem("jobsy_conversation_id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("jobsy_conversation_id", id);
  }
  return id;
}

export default function AskJobsy() {
  const suggestions = ["Resume Tips", "Job Search Advice", "Interview Prep"];
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const sendMessage = async (text) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const conversationId = getOrCreateConversationId();

    setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
    setInput("");
    setLoading(true);

    try {
      // credentials:"include" sends the httpOnly accessToken cookie to Node.
      const res = await fetch(CHAT_URL, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: trimmed, conversation_id: conversationId }),
      });

      if (res.status === 401) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "Session expired — please log in again." },
        ]);
        return;
      }

      const data = await res.json();
      const reply =
        typeof data.response === "string"
          ? data.response
          : JSON.stringify(data.response);

      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Something went wrong. Please try again." },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  return (
    <div className="card ask-jobsy-card">
      <div className="ask-header" style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <div
          style={{
            width: 34, height: 34, borderRadius: 9,
            background: "var(--accent-soft)",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0, color: "var(--accent-primary)",
          }}
        >
          <Sparkles size={18} strokeWidth={2} />
        </div>
        <h3 style={{ margin: 0, borderBottom: "none", paddingBottom: 0 }}>Ask Jobsy</h3>
      </div>

      {/* Chat history */}
      {messages.length > 0 && (
        <div
          style={{
            maxHeight: 220, overflowY: "auto", marginBottom: 10,
            display: "flex", flexDirection: "column", gap: 6,
          }}
        >
          {messages.map((m, i) => (
            <div
              key={i}
              style={{
                alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                background: m.role === "user" ? "var(--accent-primary)" : "var(--bg-secondary, #f1f5f9)",
                color: m.role === "user" ? "#fff" : "var(--text-primary, #1e293b)",
                borderRadius: 10,
                padding: "7px 12px",
                fontSize: 13,
                maxWidth: "85%",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                lineHeight: 1.5,
              }}
            >
              {m.content}
            </div>
          ))}
          {loading && (
            <div style={{ alignSelf: "flex-start", fontSize: 12, color: "var(--text-muted, #94a3b8)" }}>
              Jobsy is thinking…
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      )}

      <div className="ask-input-wrapper" style={{ position: "relative" }}>
        <input
          type="text"
          placeholder="Ask me anything…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading}
        />
        <button
          className="ask-send-btn"
          onClick={() => sendMessage(input)}
          disabled={loading}
          style={{
            position: "absolute", right: 10, top: "50%",
            transform: "translateY(-50%)",
            background: "var(--accent-gradient)",
            border: "none", borderRadius: 8,
            width: 30, height: 30,
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: loading ? "not-allowed" : "pointer",
            color: "#fff", opacity: loading ? 0.6 : 1,
          }}
        >
          <SendHorizonal size={15} strokeWidth={2.5} />
        </button>
      </div>

      {messages.length === 0 && (
        <div className="ask-suggestions">
          {suggestions.map((text) => (
            <button key={text} className="suggestion-pill" onClick={() => sendMessage(text)}>
              {text}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
