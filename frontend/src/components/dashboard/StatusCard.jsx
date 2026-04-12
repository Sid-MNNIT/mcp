import React from "react";
import { FileCheck2, Mail, Calendar, CheckCheck, X, ArrowRight } from "lucide-react";

const CONFIG = {
  resume: {
    icon: FileCheck2,
    label: "Resume",
    successDetail: "ATS-ready & fully parsed",
    errorDetail:   "Upload a resume to get started",
    accentColor:   "#16a34a",
    softColor:     "#dcfce7",
    borderColor:   "#a7f3d0",
    errorAccent:   "#dc2626",
    errorSoft:     "#fee2e2",
    errorBorder:   "#fecaca",
  },
  gmail: {
    icon: Mail,
    label: "Gmail",
    successDetail: "Emails are being synced",
    errorDetail:   "Click to connect your inbox",
    accentColor:   "#1d4ed8",
    softColor:     "#eff6ff",
    borderColor:   "#bfdbfe",
    errorAccent:   "#dc2626",
    errorSoft:     "#fee2e2",
    errorBorder:   "#fecaca",
  },
  calendar: {
    icon: Calendar,
    label: "Google Calendar",
    successDetail: "Interviews auto-scheduled",
    errorDetail:   "Connect to auto-schedule",
    accentColor:   "#7c3aed",
    softColor:     "#f5f3ff",
    borderColor:   "#ddd6fe",
    errorAccent:   "#dc2626",
    errorSoft:     "#fee2e2",
    errorBorder:   "#fecaca",
  },
};

export default function StatusCard({
  type = "resume",
  statusText = "Parsed & Ready",
  lastUpdated = "Updated just now",
  state = "success",
  onClick,
}) {
  const cfg = CONFIG[type] || CONFIG.resume;
  const Icon = cfg.icon;
  const isSuccess = state === "success";

  const accentColor = isSuccess ? cfg.accentColor : cfg.errorAccent;
  const softColor   = isSuccess ? cfg.softColor   : cfg.errorSoft;
  const borderColor = isSuccess ? cfg.borderColor : cfg.errorBorder;
  const detail      = isSuccess ? cfg.successDetail : cfg.errorDetail;

  return (
    <div
      className="scv3"
      onClick={onClick}
      tabIndex={onClick ? 0 : -1}
      role={onClick ? "button" : undefined}
      onKeyDown={(e) => {
        if (onClick && (e.key === "Enter" || e.key === " ")) onClick();
      }}
      style={{
        "--ca": accentColor,
        "--cs": softColor,
        "--cb": borderColor,
        cursor: onClick ? "pointer" : "default",
      }}
    >
      <div className="scv3__bar" />

      <div className="scv3__head">
        <div className="scv3__icon">
          <Icon size={18} strokeWidth={2} />
        </div>
        <span className="scv3__label">{cfg.label}</span>
        <span className={`scv3__badge ${isSuccess ? "scv3__badge--ok" : "scv3__badge--err"}`}>
          {isSuccess
            ? <><CheckCheck size={11} strokeWidth={2.5} /> Active</>
            : <><X size={11} strokeWidth={2.5} /> Inactive</>
          }
        </span>
      </div>

      <div className="scv3__body">
        <span className="scv3__value">{statusText}</span>
        <span className="scv3__detail">{detail}</span>
      </div>

      <div className="scv3__footer">
        <span className="scv3__ts">{lastUpdated}</span>
        {onClick && !isSuccess && (
          <span className="scv3__cta">
            Connect <ArrowRight size={11} strokeWidth={2.5} />
          </span>
        )}
      </div>
    </div>
  );
}