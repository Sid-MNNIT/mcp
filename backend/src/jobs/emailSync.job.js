import { Worker, UnrecoverableError } from "bullmq";
import { User } from "../models/user.model.js";
import { Email } from "../models/email.model.js";
import { calendarService } from "../services/calendar.service.js";
import { sseService } from "../services/sse.service.js";
import { EMAIL_SYNC_QUEUE, createRedisConnection } from "../services/emailSyncQueue.service.js";

// Email sync worker.
// The queue (services/emailSyncQueue.service.js) decides WHEN a sync should
// happen. This file is the part that actually does it, one job per user:
//   1. ask the orchestrator to read Gmail and save new emails as PENDING
//   2. tell the browser (SSE) so the emails show up straight away
//   3. ask the orchestrator to classify the PENDING emails
//   4. tell the browser again, then create calendar events for interviews

// Detect permanently revoked Gmail tokens
function isTokenRevoked(errorText) {
  return (
    errorText.includes("invalid_grant") ||
    errorText.includes("Token has been expired or revoked") ||
    errorText.includes("Gmail token expired or revoked") ||
    errorText.includes("User must re-authorise Gmail")
  );
}

// Call one of the orchestrator pipelines on behalf of a user
async function callOrchestrator(path, userId, body = {}) {
  const orchestratorUrl = process.env.ORCHESTRATOR_URL || "http://localhost:9000";

  const res = await fetch(`${orchestratorUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Service-Key": process.env.SERVICE_KEY,
      "X-Request-Source": "cron",
      "X-User-Id": String(userId),
    },
    body: JSON.stringify({ userId, ...body }),
    // Generous timeout — Gmail MCP + Groq can be slow on Render's
    // free tier (cold starts included).
    signal: AbortSignal.timeout(150_000),
  });

  if (!res.ok) {
    const errorText = await res.text();
    // A revoked token will never work on retry, so do not retry it.
    if (isTokenRevoked(errorText)) {
      throw new UnrecoverableError("Gmail token revoked");
    }
    throw new Error(`Orchestrator ${path} failed (${res.status}): ${errorText}`);
  }
  return res.json();
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

  console.log(`📅 [EmailSync] ${interviewEmails.length} unscheduled INTERVIEW email(s) for user ${user._id}`);

  for (const email of interviewEmails) {
    // Small delay between emails to avoid hitting Groq rate limit
    await new Promise(r => setTimeout(r, 2000));

    try {
      // Reads email from MongoDB, calls Groq LLM, saves to CalendarEvent collection
      const result = await calendarService.createCalendarEventFromEmail(user._id, email._id);
      console.log(`✅ [EmailSync] Event saved: "${email.subject}" → ${result.company} on ${result.date} at ${result.time}`);
    } catch (err) {
      if (err.statusCode === 422) {
        // No date/time in email — calendar.service already marked calendarEventCreated: true
        console.warn(`⚠️ [EmailSync] Skipped "${email.subject}" — no date/time found in email`);
      } else if (err.statusCode === 400) {
        // Invalid email content — mark done so we don't retry
        console.warn(`⚠️ [EmailSync] Skipped "${email.subject}" — invalid email content`);
        await Email.findByIdAndUpdate(email._id, { calendarEventCreated: true });
      } else {
        // Unexpected error — leave calendarEventCreated: false to retry next tick
        console.error(`❌ [EmailSync] Failed "${email.subject}" (will retry):`, err.message);
      }
    }
  }
}

// What the worker does for one queued job
async function processEmailSync(job) {
  const { userId } = job.data;

  const user = await User.findById(userId);
  if (!user || !user.isGmailConnected) {
    console.log(`⏭️  [EmailSync] User ${userId} has no Gmail connected — skipping`);
    return;
  }

  console.log(`🔄 [EmailSync] Syncing user ${userId} (${job.data.trigger})`);
  await User.findByIdAndUpdate(userId, { syncStatus: "syncing" });

  // Step 1: Gmail -> MongoDB (new emails are saved as PENDING)
  const fetched = await callOrchestrator("/pipelines/ingest-emails", userId, {
    lastHistoryId: user.lastHistoryId,
  });
  if (fetched.saved > 0) {
    sseService.emit(userId, "emails-updated", { phase: "fetched", count: fetched.saved });
  }

  // Step 2: PENDING emails -> Groq -> real type (or hidden if not job related)
  const classified = await callOrchestrator("/pipelines/classify-emails", userId);
  sseService.emit(userId, "emails-updated", {
    phase: "classified",
    changed: classified.classified > 0 || fetched.saved > 0,
  });

  // Step 3: interview emails -> calendar events
  await autoScheduleInterviews(user);

  // Only now is the sync really finished, so only now we remember it.
  await User.findByIdAndUpdate(userId, {
    syncStatus: "idle",
    lastSyncedAt: new Date(),
    lastHistoryId: fetched.historyId || user.lastHistoryId,
  });
  console.log(
    `✅ [EmailSync] User ${userId}: ${fetched.saved} new, ${classified.classified} classified` +
      (fetched.skipped ? " (mailbox unchanged)" : "")
  );
}

// Runs every time an attempt fails. BullMQ retries on its own, so we only
// act when this was the last attempt.
async function handleFailedJob(job, err) {
  if (!job) return;
  const { userId } = job.data;

  if (err instanceof UnrecoverableError) {
    await User.findByIdAndUpdate(userId, { isGmailConnected: false, syncStatus: "idle" });
    console.warn(`🔌 [EmailSync] Gmail token revoked for user ${userId} — marked disconnected.`);
    sseService.emit(userId, "emails-updated", { phase: "failed" });
    return;
  }

  console.error(`❌ [EmailSync] Attempt ${job.attemptsMade}/${job.opts.attempts} failed for user ${userId}:`, err.message);

  if (job.attemptsMade >= job.opts.attempts) {
    // Set lastSyncedAt too, so a broken account is not retried every minute.
    await User.findByIdAndUpdate(userId, { syncStatus: "error", lastSyncedAt: new Date() });
    sseService.emit(userId, "emails-updated", { phase: "failed" });
  }
}

let worker = null;

// Call once at server start.
export function startEmailSyncWorker() {
  worker = new Worker(EMAIL_SYNC_QUEUE, processEmailSync, {
    connection: createRedisConnection(),
    // How many users are synced at the same time.
    concurrency: Number(process.env.EMAIL_SYNC_CONCURRENCY) || 2,
    // Groq rate limit guard: at most this many sync jobs start per minute.
    limiter: {
      max: Number(process.env.EMAIL_SYNC_JOBS_PER_MINUTE) || 10,
      duration: 60 * 1000,
    },
  });

  worker.on("failed", handleFailedJob);
  worker.on("error", (err) => console.error("❌ [EmailSync] Worker error:", err.message));
  console.log("⏰ [EmailSync] Worker started");
}

export async function stopEmailSyncWorker() {
  if (worker) await worker.close();
}
