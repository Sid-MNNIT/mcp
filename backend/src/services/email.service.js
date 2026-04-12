

import { Email } from "../models/email.model.js";
import { callMCP } from "./mcp.service.js";

class EmailService {

  async executeTool({ tool, args, userId, jwt }) {
    if (!tool) {
      throw new Error("tool is required");
    }

    const source = jwt ? "user" : "cron";

    return callMCP({
      tool,
      args,
      userId,
      jwt,
      source,
    });
  }


  async previewEmailReply({ messageId, tone, userId, jwt }) {
    if (!messageId) {
      throw new Error("messageId is required");
    }

    return callMCP({
      endpoint: "/pipelines/email-reply-preview",
      args: {
        messageId,
        tone
      },
      userId,
      jwt
    });
  }


async sendEmailReply({ draft, userId, jwt }) {
  const { to, subject, body, threadId, in_reply_to } = draft || {};

  if (!to || !subject || !body || !threadId || !in_reply_to) {
    throw new Error("Invalid draft");
  }

  const result = await callMCP({
    endpoint: "/pipelines/email-reply-send",
    args: { draft },
    userId,
    jwt
  });

  // ✅ Save sent email to DB so it appears in the Sent folder
  try {
    const sentMessageId = result?.messageId || `sent_${Date.now()}`;
    await Email.findOneAndUpdate(
      { userId, emailId: sentMessageId },
      {
        $set: {
          provider: "gmail",
          type: "OTHER",
          from: "me",
          subject: subject,
          text: body,
          threadId: threadId,
          date: new Date(),
          folder: "SENT",      // ← key field
          isEmbedded: false,
        },
      },
      { upsert: true, new: true }
    );
  } catch (saveErr) {
    console.error("⚠️ Gmail send succeeded but DB store failed:", saveErr.message);
    
  }

  return result;
}

  async syncEmails({ userId, jwt }) {
    if (!jwt) {
      throw new Error("JWT missing");
    }

    return callMCP({
      endpoint: "/pipelines/email-sync",
      userId,
      jwt
    });
  }
  /*email sync for cron job */
  async syncEmailsInternal({ userId, lookback_days, max_results }) {
    if (!userId) {
      throw new Error("userId is required");
    }

    return callMCP({
      endpoint: "/pipelines/email-sync",
      userId,
      source: "cron",
      ...(lookback_days !== undefined && { lookback_days }),
      ...(max_results   !== undefined && { max_results }),
    });
  }
}

export const emailService = new EmailService();
