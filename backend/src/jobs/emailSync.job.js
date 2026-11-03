import cron from "node-cron";
import fetch from "node-fetch";
import pLimit from "p-limit";
import { User } from "../models/user.model.js";
import { Email } from "../models/email.model.js";
import { calendarService } from "../services/calendar.service.js";
import jwt from "jsonwebtoken";

const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || "http://localhost:9000";

// Cap concurrent ingest calls to the orchestrator so we don't fire off
// unbounded parallel requests when the user list grows.
const ingestLimit = pLimit(5);

// Overlap guards — each job skips its own tick if the previous tick of
// THAT SAME job is still running. They are independent of each other so
// a slow ingest run never blocks the (cheap, fast) scheduler run.
let isIngestRunning = false;
let isSchedulerRunning = false;

// Generate a short-lived JWT for the user so orchestrator accepts ingest requests
function generateServiceJWT(user) {
  return jwt.sign(
    { _id: user._id, email: user.email },
    process.env.ACCESS_TOKEN_SECRET,
    { expiresIn: "10m" }
  );
}

// Detect permanently revoked Gmail tokens
function isTokenRevoked(errorText) {
  return (
    errorText.includes("invalid_grant") ||
    errorText.includes("Token has been expired or revoked") ||
    errorText.includes("Gmail token expired or revoked") ||
    errorText.includes("User must re-authorise Gmail")
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
      // Generous timeout — Gmail MCP + Groq can be slow on Render's
      // free tier. 150s comfortably fits: fetch (~10s) + classification
      // for 15 messages (~20s) + saves, with headroom for cold starts.
      signal: AbortSignal.timeout(150_000),
    });
    if (!res.ok) {
      const errorText = await res.text();
      if (isTokenRevoked(errorText)) {
        await User.findByIdAndUpdate(user._id, { isGmailConnected: false });
        console.warn(`🔌 [CronJob] Gmail token revoked for ${user.email} — marked disconnected.`);
      } else {
        console.error(`❌ [CronJob] Ingest failed for ${user.email}: ${errorText}`);
      }
      return false;
    }
    console.log(`📥 [CronJob] Emails ingested for user ${user._id}`);
    return true;
  } catch (err) {
    // AbortSignal timeout fires as AbortError
    if (err.name === "AbortError" || err.name === "TimeoutError") {
      console.warn(`⏱️ [CronJob] Ingest timed out for ${user.email} — skipping this run`);
      return false;
    }
    // Check if the error message itself contains revocation info
    if (isTokenRevoked(err.message)) {
      await User.findByIdAndUpdate(user._id, { isGmailConnected: false });
      console.warn(`🔌 [CronJob] Gmail token revoked for ${user.email} — marked disconnected.`);
      return false;
    }
    console.error(`❌ [CronJob] Ingest error for ${user.email}:`, err.message);
    return false;
  }
}

// Read INTERVIEW emails from MongoDB → Groq LLM → save to CalendarEvent
async function autoScheduleInterviews(user) {
  const interviewEmails = await Email.find({
    userId: user._id,
    type: "INTERVIEW",
    folder: "INBOX",   // Never create events from SENT emails (replies, etc.)
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

<<<<<<< HEAD
// Only sync users who have been active in the last 24h.
// Rationale on Render free tier:
//   - Idle users waste scarce CPU on 0.1 vCPU instances.
//   - Someone who hasn't logged in for a day probably isn't waiting on
//     fresh email data — they'll pull it themselves when they return.
//   - Skipping them keeps the cron tick short and the container CPU
//     available for live user requests.
const ACTIVE_USER_WINDOW_MS = 24 * 60 * 60 * 1000;

// Main job
async function runEmailSyncJob() {
  console.log("🔄 [CronJob] Running email sync...");
=======
// Job A: Gmail ingest only (expensive — orchestrator HTTP call, up to 90s/user)
async function runIngestJob() {
  if (isIngestRunning) {
    console.log("⏭️ [CronJob:Ingest] Previous ingest run still in progress — skipping this tick");
    return;
  }
  isIngestRunning = true;
  console.log("🔄 [CronJob:Ingest] Running email ingest...");
  try {
    const users = await User.find({ isGmailConnected: true });
    await Promise.all(
      users.map((user) => ingestLimit(() => ingestEmailsForUser(user)))
    );
    console.log("✅ [CronJob:Ingest] Done.");
  } catch (err) {
    console.error("❌ [CronJob:Ingest] Error:", err.message);
  } finally {
    isIngestRunning = false;
  }
}

// Job B: interview → calendar event scheduling only (cheap — pure MongoDB + Groq,
// no orchestrator call). Runs on its own faster cadence so interview emails get
// calendar events quickly, independent of how often the (slower) ingest job runs.
async function runSchedulerJob() {
  if (isSchedulerRunning) {
    console.log("⏭️ [CronJob:Scheduler] Previous scheduler run still in progress — skipping this tick");
    return;
  }
  isSchedulerRunning = true;
  console.log("🔄 [CronJob:Scheduler] Running interview auto-scheduler...");
>>>>>>> 8dbe323 (Gmail Workflow Changes)
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
      await autoScheduleInterviews(user);
    }
    console.log("✅ [CronJob:Scheduler] Done.");
  } catch (err) {
    console.error("❌ [CronJob:Scheduler] Error:", err.message);
  } finally {
    isSchedulerRunning = false;
  }
}

// Export — call this once at server start.
// Cadence dropped from every 2 min → every 10 min. On Render free tier
// the 2-min cadence was eating ~30s of the 120s window every tick,
// starving live user requests. 10 min is still frequent enough that
// users perceive email as "auto-syncing".
export function startEmailSyncJob() {
  console.log("⏰ [CronJob] Email sync registered — every 10 minutes");
  cron.schedule("*/10 * * * *", runEmailSyncJob);
}