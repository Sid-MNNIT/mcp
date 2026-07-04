import cron from "node-cron";
import fetch from "node-fetch";
import { User } from "../models/user.model.js";
import { Email } from "../models/email.model.js";
import { calendarService } from "../services/calendar.service.js";
import jwt from "jsonwebtoken";

const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || "http://localhost:9000";

// Generate a short-lived JWT for the user so orchestrator accepts ingest requests
function generateServiceJWT(user) {
  return jwt.sign(
    { _id: user._id, email: user.email },
    process.env.ACCESS_TOKEN_SECRET,
    { expiresIn: "10m" }
  );
}

// Call orchestrator to ingest emails for a user (Gmail → MongoDB)
async function ingestEmailsForUser(user) {
  try {
    const res = await fetch(`${ORCHESTRATOR_URL}/pipelines/ingest-emails`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Service-Key": process.env.SERVICE_KEY,
        "X-Request-Source": "cron",
        "X-User-Id": user._id.toString(),
      },
      body: JSON.stringify({ userId: user._id }),
    });
    if (!res.ok) {
      console.error(`❌ [CronJob] Ingest failed for ${user._id}: ${await res.text()}`);
      return false;
    }
    console.log(`📥 [CronJob] Emails ingested for user ${user._id}`);
    return true;
  } catch (err) {
    console.error(`❌ [CronJob] Ingest error:`, err.message);
    return false;
  }
}

// Read INTERVIEW emails from MongoDB → Groq LLM → save to CalendarEvent
async function autoScheduleInterviews(user) {
  const interviewEmails = await Email.find({
    userId: user._id,
    type: "INTERVIEW",
    calendarEventCreated: { $ne: true },
    calendarEventDeleted: { $ne: true },
  });

  if (interviewEmails.length === 0) return;

  console.log(`📅 [CronJob] ${interviewEmails.length} unscheduled INTERVIEW email(s) for user ${user._id}`);

  for (const email of interviewEmails) {
    // Small delay between emails to avoid hitting Groq rate limit
    await new Promise(r => setTimeout(r, 2000));

    try {
      // Reads email from MongoDB, calls Groq LLM, saves to CalendarEvent collection
      const result = await calendarService.createCalendarEventFromEmail(user._id, email._id);
      console.log(`✅ [CronJob] Event saved: "${email.subject}" → ${result.company} on ${result.date} at ${result.time}`);
    } catch (err) {
      if (err.statusCode === 422) {
        // No date/time in email — calendar.service already marked calendarEventCreated: true
        console.warn(`⚠️ [CronJob] Skipped "${email.subject}" — no date/time found in email`);
      } else if (err.statusCode === 400) {
        // Invalid email content — mark done so we don't retry
        console.warn(`⚠️ [CronJob] Skipped "${email.subject}" — invalid email content`);
        await Email.findByIdAndUpdate(email._id, { calendarEventCreated: true });
      } else {
        // Unexpected error — leave calendarEventCreated: false to retry next tick
        console.error(`❌ [CronJob] Failed "${email.subject}" (will retry):`, err.message);
      }
    }
  }
}

// Skip inactive users. See identical rationale in ../../jobs/emailSync.job.js.
const ACTIVE_USER_WINDOW_MS = 24 * 60 * 60 * 1000;

// Main job
async function runEmailSyncJob() {
  console.log("🔄 [CronJob] Running email sync...");
  try {
    const users = await User.find({
      isGmailConnected: true,
      lastLogin: { $gte: new Date(Date.now() - ACTIVE_USER_WINDOW_MS) },
    });

    if (users.length === 0) {
      console.log("💤 [CronJob] No recently-active users — nothing to do.");
      return;
    }

    console.log(`👥 [CronJob] Processing ${users.length} active user(s)`);

    for (const user of users) {
      // Step 1: Ingest new emails from Gmail into MongoDB
      await ingestEmailsForUser(user);
      // Step 2: Process INTERVIEW emails → CalendarEvent
      await autoScheduleInterviews(user);
    }
    console.log("✅ [CronJob] Done.");
  } catch (err) {
    console.error("❌ [CronJob] Error:", err.message);
  }
}

// Export — call this once at server start.
// Cadence dropped 2 min → 10 min to keep Render free-tier CPU available
// for live user requests.
export function startEmailSyncJob() {
  console.log("⏰ [CronJob] Email sync registered — every 10 minutes");
  cron.schedule("*/10 * * * *", runEmailSyncJob);
}