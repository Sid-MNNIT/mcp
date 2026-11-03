import { Queue } from "bullmq";
import IORedis from "ioredis";
import { User } from "../models/user.model.js";

export const EMAIL_SYNC_QUEUE = "email-sync";

// A user's inbox is checked at most once every 5 minutes.
const SYNC_GAP_MS = 5 * 60 * 1000;
// The Sync button may go sooner, but a short wait stops button spamming.
const MANUAL_GAP_MS = 30 * 1000;

// Back pressure: the queue may not grow without limit. When this many jobs
// are already waiting we say "busy" instead of piling up more work.
// The Sync button gets a little extra room so it still works when busy.
const AUTO_QUEUE_LIMIT = Number(process.env.EMAIL_SYNC_QUEUE_LIMIT) || 200;
const MANUAL_QUEUE_LIMIT = AUTO_QUEUE_LIMIT + 50;

// In BullMQ a smaller number means "run first".
const MANUAL_PRIORITY = 1;
const AUTO_PRIORITY = 10;

// BullMQ needs maxRetriesPerRequest: null on its Redis connections.
export function createRedisConnection() {
  return new IORedis(process.env.REDIS_URL || "redis://localhost:6380", {
    maxRetriesPerRequest: null,
  });
}

let queue = null;

export function getEmailSyncQueue() {
  if (!queue) {
    queue = new Queue(EMAIL_SYNC_QUEUE, {
      connection: createRedisConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 30 * 1000 },
        // Finished jobs must be removed, otherwise their jobId stays taken
        // and the same user could never be queued again.
        removeOnComplete: true,
        removeOnFail: true,
      },
    });
    queue.on("error", (err) => console.error("❌ [EmailSyncQueue] Redis error:", err.message));
  }
  return queue;
}

// Gives up after a few seconds, so an unreachable Redis cannot leave the
// HTTP request hanging forever.
function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("Redis did not answer in time")), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function addSyncJob(userId, trigger) {
  const isManual = trigger === "manual";
  const emailSyncQueue = getEmailSyncQueue();

  // One job per user: while this id exists, a second add is ignored.
  // (BullMQ does not allow ":" inside a custom jobId, so we use "-")
  const jobId = `sync-${userId}`;

  const existingJob = await emailSyncQueue.getJob(jobId);
  if (existingJob) {
    // A normal job is already waiting, but the user just pressed Sync,
    // so move it to the front of the line.
    if (isManual && (await existingJob.getState()) === "prioritized") {
      await existingJob.changePriority({ priority: MANUAL_PRIORITY });
    }
    return { queued: false, reason: "already-queued" };
  }

  // Bounded queue: refuse new work when too many jobs are already waiting.
  const counts = await emailSyncQueue.getJobCounts("waiting", "prioritized", "delayed");
  const waiting = counts.waiting + counts.prioritized + counts.delayed;
  if (waiting >= (isManual ? MANUAL_QUEUE_LIMIT : AUTO_QUEUE_LIMIT)) {
    console.warn(`🚧 [EmailSyncQueue] Queue full (${waiting} waiting) — not queuing user ${userId}`);
    return { queued: false, reason: "queue-full" };
  }

  await emailSyncQueue.add(
    "sync",
    { userId: String(userId), trigger },
    { jobId, priority: isManual ? MANUAL_PRIORITY : AUTO_PRIORITY }
  );
  console.log(`📬 [EmailSyncQueue] Queued ${trigger} sync for user ${userId}`);
  return { queued: true };
}

/**
 * The gate. Every trigger (session start, tab focus, 5 min heartbeat,
 * Sync button) comes here. It decides if a sync job is really needed
 * and puts it on the queue. It never waits for the sync itself.
 *
 * trigger: "auto" or "manual"
 */
export async function requestEmailSync(userId, trigger = "auto") {
  const user = await User.findById(userId).select("isGmailConnected lastSyncedAt");

  if (!user || !user.isGmailConnected) {
    return { queued: false, reason: "gmail-not-connected" };
  }

  const isManual = trigger === "manual";
  const minGap = isManual ? MANUAL_GAP_MS : SYNC_GAP_MS;
  const lastSynced = user.lastSyncedAt ? user.lastSyncedAt.getTime() : 0;

  if (Date.now() - lastSynced < minGap) {
    return { queued: false, reason: "synced-recently" };
  }

  try {
    return await withTimeout(addSyncJob(userId, trigger), 3000);
  } catch (err) {
    // Redis down or similar: the app still works, emails just won't refresh.
    console.error("❌ [EmailSyncQueue] Could not queue sync:", err.message);
    return { queued: false, reason: "queue-unavailable" };
  }
}

export async function closeEmailSyncQueue() {
  if (queue) await queue.close();
}
