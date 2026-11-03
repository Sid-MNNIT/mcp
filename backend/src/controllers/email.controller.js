import { Email } from "../models/email.model.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { emailService } from "../services/email.service.js";
import { requestEmailSync } from "../services/emailSyncQueue.service.js";

//store emails
const storeEmail = asyncHandler(async (req, res) => {
  console.log("req.user in storeEmail:", req.user);

  // Support both JWT-authenticated users and internal service/cron calls
  const userId = req.user?._id || req.headers["x-user-id"] || req.body.userId;

  if (!userId) {
    return res.status(401).json({ success: false, message: "Unauthorized: no userId" });
  }

  const { emailId,threadId, type, from, subject, text, date,folder, deletedByUser } = req.body;

  if (!emailId || !type || !from || !date || !threadId || !folder) {
    throw new Error("Missing required email fields");
  }
  

  const email = await Email.findOneAndUpdate(
    { userId, emailId },
    {
      $set: {
        provider: "gmail",
        type,
        from,
        subject,
        threadId,
        text,
        date: new Date(date),
        folder,
        isEmbedded: false,
        // only touch this when the caller sends it (classifier hides non-job emails)
        ...(deletedByUser !== undefined && { deletedByUser }),
      },
    },
    { upsert: true, new: true }
  );

  return res.status(201).json({
    success: true,
    message: "Email stored successfully",
    email,
  });
});

//list emails
const listEmails = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { type } = req.query;

  const filter = { userId };
  if (type) {
    filter.type = type;
  }

  const emails = await Email.find(filter)
    .sort({ date: -1 })
    .limit(5);

  return res.status(200).json({
    success: true,
    count: emails.length,
    emails,
  });
});

//delete email — soft delete so cron never re-fetches it
const deleteEmail = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { id } = req.params;

  const deletedEmail = await Email.findOneAndUpdate(
    { _id: id, userId },
    { $set: { deletedByUser: true } },
    { new: true }
  );

  if (!deletedEmail) {
    return res.status(404).json({
      success: false,
      message: "Email not found or unauthorized",
    });
  }

  return res.status(200).json({
    success: true,
    message: "Email deleted successfully",
  });
});

const getUserEmail = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { sent, starred } = req.query;

  const filter = { userId, deletedByUser: { $ne: true } };

  // ⭐ Starred is independent
  if (starred === "true") {
    filter.isStarred = true;
  }

  // 📥📤 Folder filter ONLY when explicitly asked
  if (sent === "true") {
    filter.folder = "SENT";
  } else if (sent === "false") {
    filter.folder = "INBOX";
  }
  // else → do NOT set folder at all

  const emails = await Email.find(filter)
    .sort({ date: -1 })
    .lean();

  res.status(200).json({
    success: true,
    emails,
  });
});




const toggleStarEmail=asyncHandler( async (req,res)=>{
  try {
    const { id } = req.params;

    const email = await Email.findById(id);
    if (!email) {
      return res.status(404).json({ message: "Email not found" });
    }

    email.isStarred = !email.isStarred;
    await email.save();

    res.json({
      success: true,
      emailId: id,
      isStarred: email.isStarred
    });
  } catch (err) {
    console.error("Star toggle failed", err);
    res.status(500).json({ message: "Failed to toggle star" });
  }

})










const executeAgentTool=asyncHandler(async (req, res)=> {
  try {
    const { tool, args, userId: bodyUserId } = req.body;
    
    // Get userId from either JWT (user flow) or body (cron flow)
    const userId = req.user?._id || bodyUserId;
    
    if (!userId) {
      return res.status(400).json({
        error: "userId not found - check authentication"
      });
    }

    const jwt =
      req.headers.authorization?.replace("Bearer ", "") ||
      req.cookies?.accessToken;

    const result = await emailService.executeTool({
      tool,
      args,
      userId,
      jwt:jwt||null
    });

    return res.json(result);
  } catch (err) {
    console.error("❌ executeAgentTool failed:", err.message);
    return res.status(500).json({
      error: "Agent execution failed",
      details: err.message
    });
  }
}
)

const  emailReplyPreview=asyncHandler(async (req, res)=> {
  try {
    const { messageId, tone = "professional" } = req.body;
    const userId = req.user._id;

    const jwt =
      req.headers.authorization?.replace("Bearer ", "") ||
      req.cookies?.accessToken;

    const result = await emailService.previewEmailReply({
      messageId,
      tone,
      userId,
      jwt
    });

    return res.json(result);
  } catch (err) {
    console.error("❌ emailReplyPreview failed:", err.message);
    return res.status(500).json({
      error: "AI reply preview failed",
      details: err.message
    });
  }
}
)

const emailReplySend=asyncHandler(async (req, res)=> {
  try {
    const userId = req.user._id;

    const jwt =
      req.headers.authorization?.replace("Bearer ", "") ||
      req.cookies?.accessToken;

    const result = await emailService.sendEmailReply({
      draft: req.body,
      userId,
      jwt
    });

    return res.json(result);
  } catch (err) {
    console.error("❌ emailReplySend failed:", err.message);
    return res.status(500).json({
      error: "Failed to send email",
      details: err.message
    });
  }
}
)

const emailSync=asyncHandler(async (req, res)=> {
  try {
    const userId = req.user._id;

    const jwt =
      req.headers.authorization?.replace("Bearer ", "") ||
      req.cookies?.accessToken;

    const result = await emailService.syncEmails({
      userId,
      jwt
    });

    return res.json(result);
  } catch (err) {
    console.error("❌ emailSync failed:", err.message);
    return res.status(500).json({
      error: "Email sync failed",
      details: err.message
    });
  }
}
)

// POST /api/emails/sync-trigger   Body: { trigger: "auto" | "manual" }
// Does not sync anything itself: it only asks the queue to. The result
// arrives later through the "emails-updated" SSE event.
const triggerEmailSync = asyncHandler(async (req, res) => {
  const trigger = req.body?.trigger === "manual" ? "manual" : "auto";
  const result = await requestEmailSync(req.user._id, trigger);

  return res.status(202).json({ success: true, ...result });
});

const queryEmails = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { sender, type, folder, keyword, limit = 20 } = req.body;

  const filter = { userId, deletedByUser: { $ne: true } };

  // Filter by sender name/email (e.g. "amazon", "google")
  if (sender) {
    filter.from = { $regex: sender, $options: "i" };
  }

  // Filter by email type (JOB, INTERVIEW, OFFER, REJECTION, OTHER)
  if (type) {
    filter.type = type.toUpperCase();
  }

  // Filter by folder (INBOX or SENT)
  if (folder) {
    filter.folder = folder.toUpperCase();
  }

  // Filter by keyword in subject or body
  if (keyword) {
    filter.$or = [
      { subject: { $regex: keyword, $options: "i" } },
      { text: { $regex: keyword, $options: "i" } },
    ];
  }

  const emails = await Email.find(filter)
    .sort({ date: -1 })
    .limit(parseInt(limit))
    .lean();

  return res.status(200).json({
    success: true,
    count: emails.length,
    emails,
  });
});



// POST /api/emails/exists
// Body: { emailIds: ["id1", "id2", ...] }
// Returns: { existingIds: ["id1", ...] }
const checkExistingEmailIds = asyncHandler(async (req, res) => {
  const userId = req.user?._id || req.headers["x-user-id"] || req.body.userId;

  if (!userId) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }

  const { emailIds } = req.body;

  if (!Array.isArray(emailIds) || emailIds.length === 0) {
    return res.status(200).json({ existingIds: [] });
  }

  const found = await Email.find(
    { userId, emailId: { $in: emailIds } },
    { emailId: 1 }   // only fetch the emailId field
  ).lean();

  const existingIds = found.map(e => e.emailId);

  return res.status(200).json({ existingIds });
});

export {
  storeEmail,
  listEmails,
  deleteEmail,
  getUserEmail,
  emailReplyPreview,
  emailSync,
  emailReplySend,
  executeAgentTool,
  toggleStarEmail,
  queryEmails,
  checkExistingEmailIds,
  triggerEmailSync,
};
