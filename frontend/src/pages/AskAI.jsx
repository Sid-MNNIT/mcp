import React, { useState, useRef, useEffect } from "react";
import { BotMessageSquare, SendHorizonal, Trash2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import Sidebar from "../components/layout/Sidebar";
import "../styles/dashboard.css";
import "../styles/askai.css";

const CHAT_URL = "http://localhost:5000/api/ai/chat";

const SUGGESTIONS = [
  "Summarize my recent rejection emails",
  "Any interview scheduled this week?",
  "Find me React developer jobs in Bangalore",
  "Draft a follow-up email for my last interview",
  "How is my job search going?",
];


const CONV_ID_KEY = "jobsy_ai_conv_id";

function getOrCreateConvId() {
  let id = localStorage.getItem(CONV_ID_KEY);
  if (!id) {
    id = `conv_${crypto.randomUUID()}`;
    localStorage.setItem(CONV_ID_KEY, id);
  }
  return id;
}



function TypingDots() {
  return (
    <div className="ai-typing-indicator">
      <span /><span /><span />
    </div>
  );
}

function MessageBubble({ msg }) {
  const isUser = msg.role === "user";
  const content = typeof msg.content === "string"
    ? msg.content
    : JSON.stringify(msg.content, null, 2);

  return (
    <div className={`ai-message-row ${isUser ? "user" : "assistant"}`}>
      {!isUser && (
        <div className="ai-avatar">
          <BotMessageSquare size={15} strokeWidth={2} />
        </div>
      )}
      <div className={`ai-bubble ${isUser ? "user" : "assistant"}`}>
        {isUser ? (
          content
        ) : (
          <ReactMarkdown
            components={{
              a: ({ href, children }) => (
                <a href={href} target="_blank" rel="noopener noreferrer" className="ai-md-link">
                  {children}
                </a>
              ),
              p:      ({ children }) => <p className="ai-md-p">{children}</p>,
              strong: ({ children }) => <strong className="ai-md-bold">{children}</strong>,
              ul:     ({ children }) => <ul className="ai-md-ul">{children}</ul>,
              ol:     ({ children }) => <ol className="ai-md-ol">{children}</ol>,
              li:     ({ children }) => <li className="ai-md-li">{children}</li>,
              h1:     ({ children }) => <h1 className="ai-md-h">{children}</h1>,
              h2:     ({ children }) => <h2 className="ai-md-h">{children}</h2>,
              h3:     ({ children }) => <h3 className="ai-md-h3">{children}</h3>,
              code:   ({ children }) => <code className="ai-md-code">{children}</code>,
            }}
          >
            {content}
          </ReactMarkdown>
        )}
      </div>
      {isUser && <div className="ai-user-avatar">You</div>}
    </div>
  );
}

const DEFAULT_MSG = {
  role: "assistant",
  content: "Hey! I'm Jobsy AI — ask me anything about your job search — emails, interviews, job listings, or career advice.",
};

export default function AskAI() {
  // ✅ In-memory only — never persisted to localStorage
  const [messages, setMessages] = useState([DEFAULT_MSG]);
  const [input, setInput]       = useState("");
  const [loading, setLoading]   = useState(false);
  const bottomRef  = useRef(null);
  const inputRef   = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const sendMessage = async (text) => {
    const trimmed = (text || input).trim();
    if (!trimmed || loading) return;

    const conversationId = getOrCreateConvId();

    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
    setLoading(true);

    try {

      const res = await fetch(CHAT_URL, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: trimmed,
          conversation_id: conversationId,
          metadata: {},
        }),
      });

      if (res.status === 401) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "Session expired — please log in again." },
        ]);
        return;
      }

      if (!res.ok) throw new Error("Request failed");

      const data = await res.json();
      const reply =
        typeof data.response === "string"
          ? data.response
          : JSON.stringify(data.response, null, 2);

      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Sorry, something went wrong. Please try again." },
      ]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleClear = () => {
    setMessages([DEFAULT_MSG]);
    // Reset conversation so Python starts a fresh Redis context
    localStorage.removeItem(CONV_ID_KEY);
  };

  const showSuggestions = messages.length <= 1;

  return (
    <div className="dashboard-shell">
      <Sidebar />
      <main className="ai-page">

        {/* Header */}
        <div className="ai-header">
          <div className="ai-header-left">
            <div className="ai-header-icon">
              <BotMessageSquare size={20} strokeWidth={2} />
            </div>
            <div>
              <h1 className="ai-header-title">Ask Jobsy</h1>
              <span className="ai-header-sub">Your AI job search assistant</span>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button className="ai-clear-btn" title="Clear chat history" onClick={handleClear}>
              <Trash2 size={14} strokeWidth={2} />
              Clear
            </button>
            <div className="ai-status-pill">
              <span className="ai-status-dot" />
              Online
            </div>
          </div>
        </div>

        {/* Messages */}
        <div className="ai-thread">
          {messages.map((msg, i) => (
            <MessageBubble key={i} msg={msg} />
          ))}
          {loading && (
            <div className="ai-message-row assistant">
              <div className="ai-avatar">
                <BotMessageSquare size={15} strokeWidth={2} />
              </div>
              <div className="ai-bubble assistant">
                <TypingDots />
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Suggestion Pills */}
        {showSuggestions && (
          <div className="ai-suggestions-bar">
            {SUGGESTIONS.map((s) => (
              <button key={s} className="ai-suggestion-pill" onClick={() => sendMessage(s)}>
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <div className="ai-input-bar">
          <div className="ai-input-wrapper">
            <textarea
              ref={inputRef}
              className="ai-textarea"
              rows={1}
              placeholder="Ask about your jobs, emails, interviews…"
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = Math.min(e.target.scrollHeight, 140) + "px";
              }}
              onKeyDown={handleKeyDown}
              disabled={loading}
            />
            <button
              className={`ai-send-btn ${loading || !input.trim() ? "disabled" : ""}`}
              onClick={() => sendMessage()}
              disabled={loading || !input.trim()}
            >
              <SendHorizonal size={16} strokeWidth={2.5} />
            </button>
          </div>
          <p className="ai-disclaimer">
            Jobsy AI can make mistakes. Always verify important information.
          </p>
        </div>

      </main>
    </div>
  );
}
